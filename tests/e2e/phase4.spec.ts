import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe('simulator on desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });

  const open = async (page: Page, lang = 'es') => {
    await page.goto(`/${lang}/simulator`);
    await expect(page.getByTestId('simulator')).toBeVisible();
  };
  const status = (page: Page) => page.getByTestId('plc-status');
  const outputLed = (page: Page, address: string) =>
    page.locator(`[data-output="${address}"] [data-on]`);
  const inputButton = (page: Page, address: string) =>
    page.locator(`[data-input="${address}"] button`).first();

  /** Holds a push button for `ms` milliseconds (0 = the quickest possible click). */
  async function press(page: Page, button: Locator, ms = 120) {
    const box = await button.boundingBox();
    if (!box) throw new Error('button not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    if (ms > 0) await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  test('loads the start/stop example without errors', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-element]')).toHaveCount(4); // MARCHA, MOTOR, PARO, coil
    await expect(page.getByRole('button', { name: /MARCHA/ }).first()).toBeVisible();
    await expect(status(page)).toHaveText('STOP');
    await expect(page.getByText('0 errores')).toBeVisible();
  });

  test('runs the program: start latches the motor, stop unlatches it', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
    await expect(status(page)).toHaveText('RUN');
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'false');

    await press(page, inputButton(page, 'I0.0'));
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'true');
    await page.waitForTimeout(200);
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'true'); // sealed in

    await press(page, inputButton(page, 'I0.1')); // NC stop button
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'false');

    await page.keyboard.press('F6');
    await expect(status(page)).toHaveText('STOP');
  });

  test('a click shorter than one scan is still seen by the PLC', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F5');
    await expect(status(page)).toHaveText('RUN');
    await press(page, inputButton(page, 'I0.0'), 0);
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'true');
  });

  test('power flow is drawn in RUN', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F5');
    // The NC stop contact is closed at rest: its symbol turns green.
    const green = page.locator('[data-element] line[stroke="var(--wire-on)"]');
    await expect(green).not.toHaveCount(0);
  });

  test('palette click inserts after the selection and focuses the operand', async ({ page }) => {
    await open(page);
    await page.locator('[data-element]').first().click();
    await page.locator('[data-palette="NC"]').click();
    await expect(page.locator('[data-element]')).toHaveCount(5);
    const operand = page.getByTestId('operand-input');
    await expect(operand).toBeFocused();
    await operand.fill('I0.5');
    await expect(
      page.getByRole('button', { name: /Contacto normalmente cerrado: I0\.5/ }),
    ).toBeVisible();
  });

  test('an element without address is reported as an error', async ({ page }) => {
    await open(page);
    await page.locator('[data-palette="NO"]').click();
    await expect(page.getByText('1 errores')).toBeVisible();
    await page.getByRole('tab', { name: 'Consola' }).click();
    await expect(
      page.getByRole('log').getByText('Falta asignar una dirección o variable.'),
    ).toBeVisible();
  });

  test('drag and drop from the palette into a new rung', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
    await expect(page.locator('[data-rung]')).toHaveCount(2);

    const dragTo = async (paletteType: string, accepts: 'contact' | 'coil') => {
      const source = await page.locator(`[data-palette="${paletteType}"]`).boundingBox();
      if (!source) throw new Error('palette item not visible');
      await page.mouse.move(source.x + 20, source.y + 10);
      await page.mouse.down();
      await page.mouse.move(source.x + 60, source.y + 30, { steps: 5 });
      // Drop zones of the second rung appear while dragging.
      const zone = page.locator(`[data-rung]:nth-of-type(2) [data-accepts="${accepts}"]`).first();
      const box = await zone.boundingBox();
      if (!box) throw new Error('drop zone not visible');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
    };

    await dragTo('NO', 'contact');
    await page.getByTestId('operand-input').fill('I0.3');
    await dragTo('coil', 'coil');
    await page.getByTestId('operand-input').fill('Q0.3');

    await expect(page.locator('[data-rung]').nth(1).locator('[data-element]')).toHaveCount(2);
    await expect(page.getByText('0 errores')).toBeVisible();

    // The new rung works: I0.3 switch drives Q0.3.
    await page.keyboard.press('F5');
    await page.locator('[data-input="I0.3"] [role="switch"]').click();
    await expect(outputLed(page, 'Q0.3')).toHaveAttribute('data-on', 'true');
  });

  test('undo, redo and delete with the keyboard', async ({ page }) => {
    await open(page);
    const elements = page.locator('[data-element]');
    await elements.first().click();
    await page.keyboard.press('Delete');
    await expect(elements).toHaveCount(3);
    await page.keyboard.press('Control+z');
    await expect(elements).toHaveCount(4);
    await page.keyboard.press('Control+y');
    await expect(elements).toHaveCount(3);
  });

  test('renaming a variable updates the program', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Variables' }).click();
    const name = page.getByRole('textbox', { name: 'Nombre' }).first();
    await name.fill('START');
    await expect(page.getByRole('button', { name: /: START \(I0\.0\)/ })).toBeVisible();
    await expect(page.getByText('0 errores')).toBeVisible();
  });

  test('forcing an input from the monitor', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F5');
    await page.getByRole('tab', { name: 'Monitor' }).click();
    await page.getByRole('button', { name: 'Forzar a 1 I0.0' }).click();
    await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'true');
    await expect(page.locator('[data-monitor="I0.0"]')).toContainText('F');
    await page.getByRole('button', { name: 'Liberar forzado I0.0' }).click();
  });

  test('step runs exactly one scan (F10)', async ({ page }) => {
    await open(page);
    await page.keyboard.press('F10');
    await expect(status(page)).toHaveText('PAUSA');
    await expect(page.getByText('Tiempo 0,01 s')).toBeVisible();
    await page.keyboard.press('F10');
    await expect(page.getByText('Tiempo 0,02 s')).toBeVisible();
  });

  test('works in English', async ({ page }) => {
    await open(page, 'en');
    await expect(page.getByRole('button', { name: /START/ }).first()).toBeVisible();
    await expect(page.getByText('0 errors')).toBeVisible();
  });

  test('screenshots (light and dark, running)', async ({ page }, testInfo) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await open(page);
      await page.keyboard.press('F5');
      await press(page, inputButton(page, 'I0.0'));
      await expect(outputLed(page, 'Q0.0')).toHaveAttribute('data-on', 'true');
      await page.locator('[data-element]').nth(2).click();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: `test-results/screens/phase4-simulator-${scheme}-${testInfo.project.name}.png`,
      });
    }
  });
});

test('on phones the simulator shows a desktop-only notice', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/es/simulator');
  await expect(
    page.getByRole('heading', { name: 'El simulador está diseñado para escritorio' }),
  ).toBeVisible();
  await expect(page.getByTestId('simulator')).toBeHidden();
  await page.screenshot({ path: 'test-results/screens/phase4-simulator-notice-mobile.png' });
});
