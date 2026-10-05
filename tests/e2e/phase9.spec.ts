import { expect, test, type Locator, type Page } from '@playwright/test';

const NEW_PAGES = [
  'wiring',
  'ports-and-communications',
  'memory-and-addressing',
  'iec-61131-3-languages',
  'basic-instructions',
  'best-practices',
];

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

/** Scrolls a React island into view and waits until Astro has hydrated it (client:visible). */
async function hydrated(page: Page, widget: Locator) {
  await widget.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island', { has: widget })).not.toHaveAttribute('ssr', /.*/);
}

test('the six new learn pages render in both languages without horizontal scroll', async ({
  page,
}) => {
  for (const lang of ['es', 'en']) {
    for (const slug of NEW_PAGES) {
      await page.goto(`/${lang}/learn/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/fallback|aún no está traducida/i)).toHaveCount(0);
      await noHorizontalScroll(page);
    }
  }
});

test('terminals diagram explains each part (mouse and keyboard)', async ({ page }) => {
  await page.goto('/es/learn/wiring');
  const diagram = page.getByTestId('terminal-diagram');
  await hydrated(page, diagram);
  const info = page.getByTestId('terminal-info');
  await expect(info).toContainText('Selecciona una parte del dibujo.');

  await diagram.locator('[data-part="rs485"]').click();
  await expect(info).toContainText('Puerto serial RS-485');
  await expect(info).toContainText('120 Ω');

  await diagram.locator('[data-part="inputCommon"]').focus();
  await page.keyboard.press('Enter');
  await expect(info).toContainText('Común de entradas (1M)');
  await expect(diagram.locator('[data-part="inputCommon"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await noHorizontalScroll(page);
});

test('the same program in five languages, switchable by click and arrow keys', async ({ page }) => {
  await page.goto('/en/learn/iec-61131-3-languages');
  const panel = (tab: string) => page.locator(`[data-panel="${tab}"]`);
  await expect(panel('LD')).toBeVisible();
  await expect(panel('LD').locator('[data-type="NO"]')).toHaveCount(3);
  await expect(panel('ST')).toBeHidden();

  await page.getByRole('tab', { name: 'ST' }).click();
  await expect(panel('ST')).toContainText('MOTOR := (START OR MOTOR) AND STOP;');
  await expect(panel('LD')).toBeHidden();

  await page.keyboard.press('ArrowRight');
  await expect(panel('IL')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'IL' })).toBeFocused();
  await expect(panel('IL')).toContainText('LD   START');
  await noHorizontalScroll(page);
});

test('brands page: cards, filterable comparison table and notes', async ({ page }) => {
  await page.goto('/es/brands');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marcas y software de PLC');
  await expect(page.locator('[data-brand]')).toHaveCount(8);
  await expect(page.getByText(/Información revisada en fuentes oficiales/)).toBeVisible();
  const rows = page.locator('[data-row]:visible');
  await expect(rows).toHaveCount(8);

  await page.getByLabel('Software').selectOption('free');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('[data-row="siemens"]')).toBeHidden();
  await expect(page.locator('[data-brand-count]')).toHaveText('5 de 8 marcas');

  await page.getByLabel('Dificultad').selectOption('low');
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Presencia en Latinoamérica').selectOption('high');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('[data-row="weg"]')).toBeVisible();

  await expect(
    page.getByRole('heading', { name: '¿Por qué algunos softwares son tan caros?' }),
  ).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto('/en/brands');
  await expect(
    page.getByRole('heading', { name: 'CODESYS: one environment, many brands' }),
  ).toBeVisible();
});

test('brands is no longer a placeholder in the navigation', async ({ page }) => {
  await page.goto('/es/brands');
  await expect(page.getByText('En construcción')).toHaveCount(0);
});

test('screenshots (light and dark)', async ({ page }, testInfo) => {
  const device = testInfo.project.name;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/es/learn/wiring');
    const diagram = page.getByTestId('terminal-diagram');
    await hydrated(page, diagram);
    await diagram.locator('[data-part="outputs"]').first().click();
    await diagram.screenshot({
      path: `test-results/screens/phase9-terminals-${scheme}-${device}.png`,
    });
    await page.screenshot({
      path: `test-results/screens/phase9-wiring-${scheme}-${device}.png`,
      fullPage: true,
    });
    await page.goto('/es/learn/iec-61131-3-languages');
    await page.getByRole('tab', { name: 'FBD' }).click();
    await page
      .locator('[data-lang-tabs]')
      .screenshot({ path: `test-results/screens/phase9-languages-fbd-${scheme}-${device}.png` });
    await page.getByRole('tab', { name: 'SFC' }).click();
    await page
      .locator('[data-lang-tabs]')
      .screenshot({ path: `test-results/screens/phase9-languages-sfc-${scheme}-${device}.png` });
    await page.goto('/es/brands');
    await page.screenshot({
      path: `test-results/screens/phase9-brands-${scheme}-${device}.png`,
      fullPage: true,
    });
  }
});
