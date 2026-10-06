import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage });

test.describe('IL and SFC in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phase14-init')) return;
      sessionStorage.setItem('phase14-init', '1');
      localStorage.removeItem('plcampus:project');
    });
  });

  const open = async (page: Page, query = '') => {
    await page.goto(`/es/simulator${query}`);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  const editorText = async (page: Page) =>
    ((await page.locator('[data-testid="il-editor"] .view-lines').innerText()) ?? '').replace(
      /\u00a0/g,
      ' ',
    );
  const run = (page: Page) => page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
  /** Holds a panel push button long enough for a scan. */
  const press = async (page: Page, address: string) => {
    const button = page.locator(`[data-input="${address}"] button`);
    const box = await button.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
  };

  test('LD → IL converts the program, runs it and shows the current result per line', async ({
    page,
  }) => {
    await open(page);
    await page.locator('[data-language="IL"]').click();
    await expect(page.locator('[data-testid="il-editor"] .monaco-editor')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText('lista de instrucciones (IL)');
    await expect(page.locator('[data-language="IL"]')).toHaveAttribute('aria-pressed', 'true');
    const text = await editorText(page);
    expect(text).toContain('LD    MARCHA');
    expect(text).toContain('ST    MOTOR');
    await expect(page.locator('[data-snippet="sealIn"]')).toBeVisible();
    await expect(page.getByTestId('st-help')).toContainText('Referencia rápida de IL');
    await expect(page.getByText('0 errores')).toBeVisible();

    await run(page);
    await press(page, 'I0.0');
    await expect(page.locator('[data-output="Q0.0"] [data-on="true"]')).toBeVisible();
    await expect(page.locator('.st-live-value').first()).toContainText('RA = ');
    await expect(page.locator('.st-live-on').first()).toBeVisible();
    await shot(page, 'phase14-sim-il-light');
  });

  test('IL errors are listed in the console; LD keeps its program', async ({ page }) => {
    await open(page);
    await page.locator('[data-language="IL"]').click();
    await expect(page.locator('[data-testid="il-editor"] .monaco-editor')).toBeVisible();
    await page.locator('[data-testid="il-editor"] .view-lines').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nFOO Q0.1');
    await expect(page.getByText('1 errores')).toBeVisible();
    await page.getByRole('tab', { name: 'Consola' }).click();
    await expect(page.locator('[data-st-diagnostic="IL_UNKNOWN_OPERATOR"]')).toContainText(
      '«FOO» no es un operador de IL',
    );
    await page.locator('[data-language="LD"]').click();
    await expect(page.getByTestId('notice')).toContainText('Volviste al programa Ladder');
    await expect(page.locator('[data-element]')).toHaveCount(4);
  });

  test('SFC: starter chart, add and rename a step, write a condition', async ({ page }) => {
    await open(page);
    await page.locator('[data-language="SFC"]').click();
    await expect(page.getByTestId('sfc-editor')).toBeVisible();
    await expect(page.getByTestId('notice')).toContainText('no se convierte automáticamente');
    await expect(page.locator('[data-step="S0"]')).toBeVisible();
    await expect(page.locator('[data-step="S1"]')).toBeVisible();

    await page.locator('[data-step="S1"]').click();
    await page.getByRole('button', { name: 'Agregar etapa' }).click();
    await expect(page.locator('[data-step="S2"]')).toBeVisible();
    const name = page.getByTestId('sfc-step-name');
    await name.fill('ESPERA');
    await expect(page.locator('[data-step="ESPERA"]')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar acción' }).click();
    await page.getByLabel('Variable', { exact: true }).fill('Q0.5');

    await page.locator('[data-transition="S1->ESPERA"]').click();
    await page.getByTestId('sfc-condition').fill('S1.T >= T#1s AND');
    await expect(page.getByText('1 errores')).toBeVisible();
    await page.getByTestId('sfc-condition').fill('S1.T >= T#1s');
    // ESPERA has no way out yet: that is allowed (just a dead end).
    await expect(page.getByText('0 errores')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.locator('[data-step="ESPERA"]').click();
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-step="ESPERA"]')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step="ESPERA"]')).toBeVisible();
  });

  test('batch mixer example: the SFC runs a full batch on its plant', async ({ page }) => {
    await open(page, '?example=batch-mixer');
    await expect(page.locator('[data-language="SFC"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Velocidad').selectOption('4');
    await run(page);
    const step = (name: string) => page.locator(`[data-step="${name}"]`);
    await expect(step('REPOSO')).toHaveAttribute('data-active', 'true');
    await page.getByRole('button', { name: /Pulsador NA I0\.0 MARCHA/ }).click();
    await expect(step('LLENAR_A')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('plant-valve-a')).toHaveAttribute('data-on', 'true');
    await expect(step('MEZCLAR')).toHaveAttribute('data-active', 'true', { timeout: 10_000 });
    await expect(step('MEZCLAR').locator('[data-step-time]')).toBeVisible();
    await expect(page.locator('[data-transition="MEZCLAR->VACIAR"]')).toBeVisible();
    await shot(page, 'phase14-sim-sfc-light');
    await expect(step('REPOSO')).toHaveAttribute('data-active', 'true', { timeout: 15_000 });
    await expect(page.getByTestId('plant-batches-ok')).toHaveText('Lotes correctos: 1');
    await expect(page.getByTestId('plant-done-light')).toHaveAttribute('data-on', 'true');
  });

  test('screenshots in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await open(page, '?example=batch-mixer');
    await page.getByLabel('Velocidad').selectOption('4');
    await run(page);
    await page.getByRole('button', { name: /Pulsador NA I0\.0 MARCHA/ }).click();
    await expect(page.locator('[data-step="LLENAR_B"]')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    });
    await page.locator('[data-step="LLENAR_B"]').click();
    await shot(page, 'phase14-sim-sfc-dark');

    await page.locator('[data-language="LD"]').click();
    await open(page, '?example=motor-start-stop');
    await page.locator('[data-language="IL"]').click();
    await expect(page.locator('[data-testid="il-editor"] .monaco-editor')).toBeVisible();
    await run(page);
    await page.waitForTimeout(300);
    await shot(page, 'phase14-sim-il-dark');
  });
});

test.describe('example pages', () => {
  test('the batch mixer page shows its SFC chart; Ladder examples add an IL tab', async ({
    page,
  }) => {
    await page.goto('/es/examples/batch-mixer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Mezcladora por lotes (batch) en SFC',
    );
    await expect(page.locator('figure[data-plant="mixer"]')).toBeVisible();
    await expect(page.locator('[data-static-sfc] [data-step="MEZCLAR"]')).toBeVisible();
    await expect(page.locator('[data-static-sfc]')).toContainText('MEZCLAR.T >= T#8s');
    await expect(page.getByRole('tab', { name: 'LD' })).toHaveCount(0);

    await page.goto('/en/examples/motor-start-stop');
    await page.getByRole('tab', { name: 'IL' }).click();
    await expect(page.locator('[data-panel="IL"]')).toContainText('ST    K1_MOTOR');
  });

  test('screenshots (light and dark)', async ({ page }, info) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/es/examples/batch-mixer');
      await shot(page, `phase14-batch-mixer-${info.project.name}-${scheme}`, true);
    }
  });
});
