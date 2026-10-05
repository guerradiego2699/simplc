import { expect, test, type Locator, type Page } from '@playwright/test';

/** Scrolls a React island into view and waits until Astro has hydrated it (client:visible). */
async function hydrated(page: Page, widget: Locator) {
  await widget.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island', { has: widget })).not.toHaveAttribute('ssr', /.*/);
}

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `test-results/screens/${name}-${project}.png`, fullPage: true });

const LEARN_PAGES = ['what-is-a-plc', 'how-a-plc-works', 'plc-types', 'inputs-and-outputs'];

test('learn index lists the written topics', async ({ page }) => {
  await page.goto('/es/learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aprende PLC paso a paso');
  for (const slug of LEARN_PAGES) {
    await expect(page.locator(`a[href="/es/learn/${slug}"]`).first()).toBeVisible();
  }
  // Phase 9 completed the course: nothing is "coming soon" any more.
  await expect(page.getByText('Próximamente')).toHaveCount(0);
  await expect(page.locator('#fundamentals')).toBeVisible();
});

test('every learn page renders in both languages without horizontal scroll', async ({ page }) => {
  for (const lang of ['es', 'en']) {
    for (const slug of LEARN_PAGES) {
      const url = `/${lang}/learn/${slug}`;
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // No untranslated-page notice: every page exists in both languages.
      await expect(
        page.locator('article').getByText(/not been translated|aún no está traducida/),
      ).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  }
});

test('previous / next navigation follows the course order', async ({ page }) => {
  await page.goto('/es/learn/what-is-a-plc');
  await page.getByRole('link', { name: /Siguiente/ }).click();
  await expect(page).toHaveURL(/\/es\/learn\/how-a-plc-works$/);
  await page.getByRole('link', { name: /Anterior/ }).click();
  await expect(page).toHaveURL(/\/es\/learn\/what-is-a-plc$/);
});

test('language switcher keeps the learn page', async ({ page, isMobile }) => {
  await page.goto('/es/learn/plc-types');
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'English' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/en\/learn\/plc-types$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Types of PLC');
});

test('table of contents and course navigation on desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout');
  await page.goto('/es/learn/how-a-plc-works');
  const toc = page.getByRole('navigation', { name: 'En esta página' });
  await expect(toc).toBeVisible();
  await expect(toc.getByRole('link', { name: 'El ciclo de scan' })).toHaveAttribute(
    'href',
    '#el-ciclo-de-scan',
  );
  const course = page.getByRole('navigation', { name: 'Contenido del curso' });
  await expect(course.locator('[aria-current="page"]')).toContainText('Cómo funciona');
});

test('scan cycle: an input change reaches the output only after a full pass', async ({ page }) => {
  await page.goto('/es/learn/how-a-plc-works');
  const widget = page.locator('figure', {
    has: page.getByRole('button', { name: 'Siguiente fase' }),
  });
  await hydrated(page, widget);
  const step = widget.getByRole('button', { name: 'Siguiente fase' });
  const output = widget.getByTestId('scan-physical-output');

  await step.click(); // pauses auto-play
  await widget.getByRole('switch', { name: 'Accionar interruptor' }).click();
  await expect(output).toHaveAttribute('data-on', 'false');
  for (let i = 0; i < 8; i++) await step.click(); // two full cycles are always enough
  await expect(output).toHaveAttribute('data-on', 'true');
});

test('sensor wiring widget explains PNP and NPN', async ({ page }) => {
  await page.goto('/es/learn/inputs-and-outputs');
  const widget = page.locator('figure', { has: page.getByRole('button', { name: 'NPN' }) });
  await hydrated(page, widget);
  await expect(widget).toContainText('COM a 0 V');
  await widget.getByRole('switch').click();
  await expect(widget).toContainText('conecta el cable negro a +24 V');
  await widget.getByRole('button', { name: 'NPN' }).click();
  await expect(widget).toContainText('COM a +24 V');
  await expect(widget).toContainText('conecta el cable negro a 0 V');
});

test('analog widget detects a broken 4–20 mA loop', async ({ page }) => {
  await page.goto('/es/learn/inputs-and-outputs');
  const widget = page.locator('figure', { hasText: 'Simular cable cortado' });
  await hydrated(page, widget);
  await widget.getByLabel('Simular cable cortado').check();
  await expect(widget).toContainText('el PLC detecta la falla');
  await expect(widget).toContainText('la falla pasa inadvertida');
});

test('screenshots (light and dark)', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/es/learn');
    await shot(page, `phase2-learn-index-${scheme}`, project);
    await page.goto('/es/learn/inputs-and-outputs');
    await shot(page, `phase2-inputs-outputs-${scheme}`, project);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/en/learn/how-a-plc-works');
  await shot(page, 'phase2-how-it-works-en-light', project);
});
