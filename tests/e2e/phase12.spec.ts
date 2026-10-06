import { expect, test, type Page } from '@playwright/test';

test.describe('FBD in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phase12-init')) return;
      sessionStorage.setItem('phase12-init', '1');
      localStorage.removeItem('plcampus:project');
      localStorage.removeItem('plcampus:challenges');
    });
  });

  const open = async (page: Page, url = '/es/simulator') => {
    await page.goto(url);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  const toFbd = async (page: Page) => {
    await page.locator('[data-language="FBD"]').click();
    await expect(page.getByTestId('fbd-editor')).toBeVisible();
  };
  const editor = (page: Page) => page.getByTestId('fbd-editor');

  test('the Ladder program becomes a network of blocks and runs the same', async ({ page }) => {
    await open(page);
    await toFbd(page);
    await expect(page.getByTestId('notice')).toContainText('Mismo programa, ahora en FBD');
    await expect(editor(page).locator('[data-box="or"]')).toHaveCount(1);
    await expect(editor(page).locator('[data-box="and"]')).toHaveCount(1);
    await expect(editor(page).locator('[data-box="output"]')).toHaveCount(1);
    await expect(editor(page).locator('[data-type="NO"]')).toHaveCount(3);
    await expect(page.getByText('Red 1')).toBeVisible();
    await expect(page.getByText('Entradas y flancos')).toBeVisible();

    await page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
    const start = page.locator('[data-input="I0.0"] button');
    const box = await start.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(page.locator('[data-output="Q0.0"] [data-on="true"]')).toBeVisible();
    await expect(editor(page).locator('line[stroke="var(--wire-on)"]')).not.toHaveCount(0);
  });

  test('editing in FBD changes the shared program; LD shows the same', async ({ page }) => {
    await open(page);
    await toFbd(page);
    // Negate an input from the properties panel.
    await editor(page).locator('[data-type="NO"]').first().click();
    await expect(page.getByRole('combobox', { name: 'Tipo' })).toHaveValue('NO');
    await expect(page.getByRole('option', { name: 'Entrada negada' })).toBeAttached();
    await page.getByRole('combobox', { name: 'Tipo' }).selectOption('NC');
    await expect(editor(page).locator('[data-type="NC"]')).toHaveCount(1);

    // A palette click adds a new input after the selection (it becomes an AND input).
    await page.locator('[data-palette="NO"]').click();
    await page.getByTestId('operand-input').fill('I0.5');
    await expect(editor(page).locator('[data-type="NO"]')).toHaveCount(3);

    // Drag a timer onto a zone.
    const item = page.locator('[data-palette="TON"]');
    await item.scrollIntoViewIfNeeded();
    const from = await item.boundingBox();
    await page.mouse.move(from!.x + 20, from!.y + 10);
    await page.mouse.down();
    await page.mouse.move(from!.x + 80, from!.y + 30, { steps: 5 });
    const zone = editor(page).locator('[data-accepts="contact"]').last();
    const to = await zone.boundingBox();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(editor(page).locator('[data-type="TON"]')).toHaveCount(1);

    // Same program in Ladder.
    await page.locator('[data-language="LD"]').click();
    await expect(page.getByTestId('notice')).toContainText('Mismo programa, ahora en Ladder');
    await expect(page.locator('[data-element][data-type="TON"]')).toHaveCount(1);
    await expect(page.locator('[data-element][data-type="NC"]')).toHaveCount(1);
  });

  test('challenges can be solved in FBD', async ({ page }) => {
    await open(page, '/es/simulator?challenge=first-output');
    await expect(page.getByTestId('challenge-panel')).toBeVisible();
    await expect(page.locator('[data-language="FBD"]')).toBeEnabled();
    await toFbd(page);
    await page.locator('[data-palette="NO"]').click();
    await page.getByTestId('operand-input').fill('PULSADOR');
    await page.locator('[data-palette="coil"]').click();
    await page.getByTestId('operand-input').fill('LAMPARA');
    await page.getByRole('tab', { name: 'Desafío' }).click();
    await page.getByTestId('challenge-verify').click();
    await expect(page.getByTestId('challenge-result')).toHaveAttribute('data-status', 'passed');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshot of the FBD editor running (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await open(page, '/es/simulator?example=traffic-light');
      await toFbd(page);
      await page.getByRole('button', { name: 'Cerrar aviso' }).click();
      await page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
      await page
        .getByRole('switch', { name: /MARCHA/ })
        .first()
        .click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/screens/phase12-fbd-${scheme}.png` });
    });
  }
});

test.describe('FBD on content pages', () => {
  test('example pages show the program in LD, FBD and ST', async ({ page }) => {
    await page.goto('/es/examples/motor-start-stop');
    await expect(page.locator('[data-panel="LD"]')).toBeVisible();
    await page.getByRole('tab', { name: 'FBD' }).click();
    const fbd = page.locator('[data-panel="FBD"]');
    await expect(fbd).toBeVisible();
    await expect(fbd.locator('[data-box="or"]')).toHaveCount(1);
    await expect(fbd.getByText('Red 1')).toBeVisible();
    await page.getByRole('tab', { name: 'ST' }).click();
    await expect(page.locator('[data-panel="ST"] pre')).toContainText(
      'K1_MOTOR := (MARCHA OR K1_MOTOR) AND PARO AND TERMICO;',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('the languages page draws the FBD tab with the real renderer', async ({ page }) => {
    await page.goto('/en/learn/iec-61131-3-languages');
    await page.getByRole('tab', { name: 'FBD' }).click();
    await expect(page.locator('[data-panel="FBD"] [data-box="or"]')).toHaveCount(1);
    await expect(page.locator('[data-panel="FBD"] [data-box="and"]')).toHaveCount(1);
  });

  test('screenshots of the example FBD tab (light and dark)', async ({ page }, testInfo) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/es/examples/traffic-light');
      await page.getByRole('tab', { name: 'FBD' }).click();
      await page.locator('[data-panel="FBD"]').screenshot({
        path: `test-results/screens/phase12-example-fbd-${scheme}-${testInfo.project.name}.png`,
      });
    }
  });
});
