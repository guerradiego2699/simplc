import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `test-results/screens/${name}-${project}.png`, fullPage: true });

test.describe('root locale detection', () => {
  test.describe('English browser', () => {
    test.use({ locale: 'en-US' });
    test('redirects / to /en/', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/en\/$/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });

  test.describe('Spanish browser', () => {
    test.use({ locale: 'es-CL' });
    test('redirects / to /es/ and remembers a manual choice', async ({ page, isMobile }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/es\/$/);

      if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
      await page.getByRole('link', { name: 'English' }).filter({ visible: true }).click();
      await expect(page).toHaveURL(/\/en\/$/);

      await page.goto('/');
      await expect(page).toHaveURL(/\/en\/$/);
    });
  });
});

test('home renders in both languages', async ({ page }) => {
  await page.goto('/es/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Aprende PLC');
  await expect(page).toHaveTitle(/PLCampus/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    'https://plcampus.com/en/',
  );

  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn PLCs');
});

test('language switcher keeps the current page', async ({ page, isMobile }) => {
  await page.goto('/es/learn');
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'English' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/en\/learn\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn PLCs step by step');
});

test('theme selector applies and persists the choice', async ({ page, isMobile }) => {
  await page.goto('/es/');
  const html = page.locator('html');
  const openMenu = async () => {
    if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  };

  await openMenu();
  await page.getByRole('button', { name: 'Oscuro' }).filter({ visible: true }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await openMenu();
  await page.getByRole('button', { name: 'Sistema' }).filter({ visible: true }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
});

test('motor start/stop demo latches and unlatches', async ({ page }) => {
  await page.goto('/es/');
  const demo = page.locator('[data-motor-demo]');
  const status = demo.locator('[data-motor-status]');
  const press = async (name: string) => {
    await demo.getByRole('button', { name }).hover();
    await page.mouse.down();
    await page.mouse.up();
  };

  await expect(status).toHaveText('Detenido');
  await press('MARCHA');
  await expect(status).toHaveText('En marcha'); // seal-in keeps it running after release
  await demo.screenshot({
    path: `test-results/screens/phase1-demo-running-${test.info().project.name}.png`,
  });
  await press('PARO');
  await expect(status).toHaveText('Detenido');
});

test('mobile menu opens and closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/es/');
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  await toggle.click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-menu')).toBeHidden();
});

test('no horizontal scroll on content pages', async ({ page }) => {
  for (const url of ['/es/', '/en/', '/es/learn']) {
    await page.goto(url);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
});

test('unknown URL shows the 404 page', async ({ page }) => {
  const response = await page.goto('/en/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página no encontrada');
  await expect(page.locator('[data-home-link]')).toHaveAttribute('href', '/en/');
});

test('screenshots (light and dark)', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/es/');
    await shot(page, `phase1-home-es-${scheme}`, project);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/en/');
  await shot(page, 'phase1-home-en-light', project);
  await page.goto('/es/simulator');
  await shot(page, 'phase1-placeholder-light', project);
});
