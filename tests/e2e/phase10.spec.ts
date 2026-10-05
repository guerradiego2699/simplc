import { expect, test, type Page } from '@playwright/test';

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test('glossary: search in both languages and filter by letter', async ({ page }) => {
  await page.goto('/es/glossary');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Glosario de PLC y automatización',
  );
  const visible = page.locator('[data-entry]:visible');
  const total = await visible.count();
  expect(total).toBeGreaterThan(50);

  const search = page.getByRole('searchbox', { name: 'Buscar en el glosario' });
  await search.fill('overload'); // English term, Spanish page
  await expect(visible).toHaveCount(1);
  await expect(visible.first()).toContainText('Relé térmico');

  await search.fill('senal analogica'); // accents are ignored
  await expect(visible).not.toHaveCount(0);

  await search.fill('xyzxyz');
  await expect(visible).toHaveCount(0);
  await expect(page.getByText('No encontramos términos con esa búsqueda.')).toBeVisible();

  await search.fill('');
  await page.getByRole('button', { name: 'T', exact: true }).click();
  await expect(visible).toHaveCount(5);
  await expect(page.locator('[data-glossary-count]')).toHaveText('5 términos');
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(visible).toHaveCount(total);
  await noHorizontalScroll(page);

  await page.goto('/en/glossary');
  await expect(page.getByText('Overload relay', { exact: true })).toBeVisible();
});

test('FAQ: accordion and structured data', async ({ page }) => {
  await page.goto('/es/faq');
  const item = page.locator('[data-faq="mobile"]');
  await expect(item.locator('p').first()).toBeHidden();
  await item.locator('summary').click();
  await expect(item.locator('p').first()).toBeVisible();
  await expect(item).toContainText('1024 px');

  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  );
  expect(jsonLd['@type']).toBe('FAQPage');
  expect(jsonLd.mainEntity.length).toBe(await page.locator('[data-faq]').count());
  expect(JSON.stringify(jsonLd)).not.toContain('{site}');
  await noHorizontalScroll(page);
});

test('support page without configured donation links and legal page', async ({ page }) => {
  await page.goto('/es/support');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apoyar el proyecto');
  await expect(page.locator('[data-donations-soon]')).toBeVisible();
  await expect(page.locator('[data-donation]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir al repositorio en GitHub' })).toBeVisible();

  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Aviso legal y privacidad' })
    .click();
  await expect(page).toHaveURL(/\/es\/legal$/);
  await expect(page.locator('article section')).toHaveCount(6);
  await expect(page.getByText(/Vercel Web Analytics/)).toBeVisible();
  await noHorizontalScroll(page);
});

test('SEO files and meta tags', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://plcampus.com/sitemap-index.xml');
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('<loc>https://plcampus.com/es/glossary</loc>');
  expect(sitemap).toContain('hreflang="en" href="https://plcampus.com/en/glossary"');
  expect(sitemap).not.toContain('<loc>https://plcampus.com/</loc>');
  expect((await request.get('/og-image.png')).ok()).toBe(true);

  await page.goto('/en/brands');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://plcampus.com/og-image.png',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://plcampus.com/en/brands',
  );
  await expect(page.locator('link[hreflang="es"]')).toHaveAttribute(
    'href',
    'https://plcampus.com/es/brands',
  );
  // Analytics only load in builds made on Vercel.
  await expect(page.locator('script[src*="_vercel/insights"]')).toHaveCount(0);
});

test('no section is "under construction" any more', async ({ page }) => {
  for (const path of ['glossary', 'faq', 'support', 'legal', 'brands', 'challenges', 'examples']) {
    await page.goto(`/es/${path}`);
    await expect(page.getByText('En construcción')).toHaveCount(0);
  }
});

test('screenshots (light and dark)', async ({ page }, testInfo) => {
  const device = testInfo.project.name;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const path of ['glossary', 'faq', 'support', 'legal']) {
      await page.goto(`/es/${path}`);
      if (path === 'faq') await page.locator('[data-faq="free"] summary').click();
      await page.screenshot({
        path: `test-results/screens/phase10-${path}-${scheme}-${device}.png`,
        fullPage: path !== 'glossary',
      });
    }
  }
});
