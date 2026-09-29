import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe('timers, counters, styles and scan visualization', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  // Every page load starts from the built-in example (autosave from Phase 6 is tested separately).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('plcampus:project'));
  });

  const open = async (page: Page) => {
    await page.goto('/es/simulator');
    await expect(page.getByTestId('simulator')).toBeVisible();
  };
  const led = (page: Page, address: string) => page.locator(`[data-output="${address}"] [data-on]`);
  const palette = async (page: Page, type: string) => {
    const item = page.locator(`[data-palette="${type}"]`);
    await item.scrollIntoViewIfNeeded();
    await item.click();
  };
  const switchInput = (page: Page, address: string) =>
    page.locator(`[data-input="${address}"] [role="switch"]`);

  /** Adds a rung "<contact I> → <box> → coil Q" using palette clicks. */
  async function addRung(
    page: Page,
    input: string,
    box: string,
    params: Record<string, string>,
    output: string,
  ) {
    await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
    await palette(page, 'NO');
    await page.getByTestId('operand-input').fill(input);
    await palette(page, box);
    for (const [key, value] of Object.entries(params)) {
      await page.getByTestId(key === 'operand' ? 'operand-input' : `param-${key}`).fill(value);
    }
    await palette(page, 'coil');
    await page.getByTestId('operand-input').fill(output);
  }

  test('TON delays the output by its preset (and gets the first free instance)', async ({
    page,
  }) => {
    await open(page);
    await addRung(page, 'I0.2', 'TON', { pt: 'T#1s' }, 'Q0.2');
    await expect(page.locator('[data-type="TON"]')).toContainText('T0'); // auto instance
    await expect(page.getByText('0 errores')).toBeVisible();

    await page.keyboard.press('F5');
    await switchInput(page, 'I0.2').click();
    await page.waitForTimeout(500);
    await expect(led(page, 'Q0.2')).toHaveAttribute('data-on', 'false');
    // Live elapsed time is drawn inside the box while it runs.
    await expect(page.locator('[data-type="TON"] text[data-live]')).toHaveCount(1);
    await expect(led(page, 'Q0.2')).toHaveAttribute('data-on', 'true', { timeout: 3000 });
  });

  test('CTU counts switch pulses up to its preset', async ({ page }) => {
    await open(page);
    await addRung(page, 'I0.3', 'CTU', { pv: '3' }, 'Q0.3');
    await expect(page.getByText('0 errores')).toBeVisible();
    await page.keyboard.press('F5');
    const sw = switchInput(page, 'I0.3');
    for (let i = 0; i < 3; i++) {
      await sw.click();
      await page.waitForTimeout(60);
      await sw.click();
      await page.waitForTimeout(60);
    }
    await expect(led(page, 'Q0.3')).toHaveAttribute('data-on', 'true');
    await page.getByRole('tab', { name: 'Monitor' }).click();
    await expect(page.locator('[data-monitor="C0.CV"] [data-value]')).toHaveText('3');
  });

  test('output boxes: MOVE and ADD write words shown in the monitor', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
    await palette(page, 'NO');
    await page.getByTestId('operand-input').fill('S0.0'); // always on
    await palette(page, 'MOVE');
    await page.getByTestId('operand-input').fill('MW0');
    await page.getByTestId('param-in').fill('40');
    await palette(page, 'ADD');
    await page.getByTestId('operand-input').fill('MW1');
    await page.getByTestId('param-in1').fill('MW0');
    await page.getByTestId('param-in2').fill('2');
    await expect(page.getByText('0 errores')).toBeVisible();
    await page.keyboard.press('F5');
    await page.getByRole('tab', { name: 'Monitor' }).click();
    await expect(page.locator('[data-monitor="MW1"] [data-value]')).toHaveText('42');
  });

  test('type errors are reported in plain language', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
    await palette(page, 'MOVE');
    await page.getByTestId('operand-input').fill('Q0.0');
    await page.getByTestId('param-in').fill('5');
    await expect(
      page
        .getByRole('tabpanel')
        .getByText('Tipo de dato incorrecto: se esperaba BOOL (bit) y se recibió INT (entero).'),
    ).toBeVisible();
  });

  test('address styles change only the notation', async ({ page }) => {
    await open(page);
    const style = page.getByTestId('address-style');
    await style.selectOption('mitsubishi');
    await expect(page.locator('[data-input="I1.0"]')).toContainText('X10');
    await expect(page.locator('[data-output="Q0.0"]')).toContainText('Y0');
    await style.selectOption('omron');
    await expect(page.locator('[data-input="I0.1"]')).toContainText('0.01');
    await style.selectOption('ab');
    await expect(page.locator('[data-output="Q1.0"]')).toContainText('O:0/8');
    // The program still runs the same.
    await page.keyboard.press('F5');
    await page.locator('[data-input="I0.0"] button').first().click();
    await expect(led(page, 'Q0.0')).toHaveAttribute('data-on', 'true');
    await style.selectOption('generic');
  });

  test('visualize scan: phases in order, and inputs change the image only at "read"', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Ciclo de scan' }).click();
    const next = page.getByRole('button', { name: 'Siguiente paso' });
    const current = page.locator('[data-phase][aria-current="step"]');
    const cells = (address: string) => page.locator(`[data-scan-row="${address}"] [data-bit]`);

    await next.click();
    await expect(current).toHaveAttribute('data-phase', 'read');

    // Press START now (after "read"): the terminal shows 1, the image still 0.
    const start = page.locator('[data-scan-row="I0.0"] button');
    const box = (await start.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(cells('I0.0').nth(0)).toHaveText('1');
    await expect(cells('I0.0').nth(1)).toHaveText('0');
    await page.mouse.up();

    await next.click();
    await expect(current).toHaveAttribute('data-phase', 'execute');
    await expect(page.locator('[data-executing]')).toHaveCount(1);
    await next.click();
    await expect(current).toHaveAttribute('data-phase', 'write');
    await next.click();
    await expect(current).toHaveAttribute('data-phase', 'housekeeping');

    // Next cycle: the press (held for one full scan) is now in the image and reaches the motor.
    await next.click();
    await expect(current).toHaveAttribute('data-phase', 'read');
    await expect(cells('I0.0').nth(1)).toHaveText('1');
    await next.click(); // execute
    await next.click(); // write: the output terminal turns on
    await expect(cells('Q0.0').nth(1)).toHaveText('1');

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('[data-executing]')).toHaveCount(0);
  });

  test('screenshots with every instruction family (light and dark)', async ({ page }, testInfo) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await open(page);
      await addRung(page, 'I0.2', 'TON', { pt: 'T#10s' }, 'Q0.2');
      await addRung(page, 'I0.3', 'CTU', { pv: '5', r: 'I0.4' }, 'Q0.3');
      await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
      await palette(page, 'GE');
      await page.getByTestId('operand-input').fill('C0.CV');
      await page.getByTestId('param-in2').fill('2');
      await palette(page, 'ADD');
      await page.getByTestId('operand-input').fill('MW1');
      await page.getByTestId('param-in1').fill('C0.CV');
      await page.getByTestId('param-in2').fill('100');
      await page.keyboard.press('F5');
      await switchInput(page, 'I0.2').click();
      for (let i = 0; i < 3; i++) {
        await switchInput(page, 'I0.3').click();
        await page.waitForTimeout(60);
        await switchInput(page, 'I0.3').click();
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: `test-results/screens/phase5-simulator-${scheme}-${testInfo.project.name}.png`,
      });
    }
  });
});

export type { Locator };
