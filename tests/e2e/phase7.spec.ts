import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

/** Starts the PLC with the toolbar button (works in both languages). */
const run = (page: Page) => page.getByRole('button', { name: /^(Ejecutar|Run) \(F5\)$/ }).click();

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test.describe('examples pages', () => {
  test('gallery lists the four examples and the upcoming ones', async ({ page }) => {
    await page.goto('/es/examples');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Ejemplos resueltos con plantas virtuales',
    );
    await expect(page.locator('[data-example]')).toHaveCount(4);
    await expect(page.getByText('Próximamente')).toHaveCount(10);
    await expect(page.getByRole('link', { name: 'Semáforo de un cruce' })).toHaveAttribute(
      'href',
      '/es/examples/traffic-light',
    );
    await noHorizontalScroll(page);

    await page.goto('/en/examples');
    await expect(
      page.getByRole('link', { name: 'Tank filling with level switches' }),
    ).toBeVisible();
  });

  test('example page: summary, plant, I/O table, ladder program and steps', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/es/examples/motor-start-stop');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Partida y parada de motor con autorretención',
    );
    await expect(page.locator('figure[data-plant="motor"]')).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('MARCHA');
    // The Ladder tab (FBD and ST are in hidden tabs).
    await expect(page.locator('[data-panel="LD"] svg [data-type="NO"]')).toHaveCount(4);
    await expect(page.locator('[data-panel="LD"] svg [data-type="coil"]')).toHaveCount(1);
    await expect(page.getByText('Peldaño 1')).toBeVisible();
    await noHorizontalScroll(page);

    const open = page.getByTestId('open-in-simulator');
    await expect(open).toHaveAttribute('href', '/es/simulator?example=motor-start-stop');
    if (isMobile) {
      await expect(open).toBeHidden();
      await expect(page.getByText('El simulador está pensado para computadores')).toBeVisible();
    } else {
      await expect(open).toBeVisible();
    }

    await page.goto('/en/examples/traffic-light');
    await expect(page.getByText('Rung 7')).toBeVisible();
    await expect(page.locator('[data-plant="traffic"]')).toBeVisible();
  });

  test('learn pages link only to existing examples', async ({ page }) => {
    await page.goto('/es/learn/how-a-plc-works');
    await expect(page.locator('a[href*="?example="]')).toHaveAttribute(
      'href',
      '/es/simulator?example=lamp-switch',
    );
  });

  test('screenshots (light and dark)', async ({ page }, testInfo) => {
    const device = testInfo.project.name;
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/es/examples');
      await shot(page, `phase7-gallery-${scheme}-${device}`);
      await page.goto('/es/examples/tank-filling');
      await shot(page, `phase7-tank-page-${scheme}-${device}`);
    }
  });
});

test.describe('examples in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('plcampus:project'));
  });

  const openExample = async (page: Page, id: string) => {
    await page.goto(`/es/simulator?example=${id}`);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  const light = (page: Page, id: string) => page.getByTestId(`plant-light-${id}`);

  test('?example= loads the example, shows the plant and drops the parameter', async ({ page }) => {
    await openExample(page, 'tank-filling');
    await expect(page.getByTestId('notice')).toContainText('Llenado de estanque');
    await expect(page).toHaveURL(/\/es\/simulator$/);
    await expect(page.getByTestId('project-name')).toHaveValue(
      'Llenado de estanque con sensores de nivel',
    );
    await expect(page.getByRole('tab', { name: 'Planta virtual' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('plant-select')).toHaveValue('tank');
    // Undo returns to the previous project.
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('plant-select')).toHaveValue('');
  });

  test('tank: the pump fills up to the high switch and stops', async ({ page }) => {
    await openExample(page, 'tank-filling');
    await run(page);
    await page.getByRole('switch', { name: /SISTEMA/ }).click();
    await expect(page.getByTestId('plant-pump')).toHaveAttribute('data-on', 'true');
    await expect(page.getByTestId('plant-sensor-low')).toHaveAttribute('data-on', 'true', {
      timeout: 5000,
    });
    // Still pumping above the low switch (seal-in).
    await expect(page.getByTestId('plant-pump')).toHaveAttribute('data-on', 'true');
    // The high switch is covered only for an instant: the pump stops and the level drops.
    await expect(page.getByTestId('plant-pump')).toHaveAttribute('data-on', 'false', {
      timeout: 20_000,
    });
    const level = Number.parseInt((await page.getByTestId('plant-level').textContent()) ?? '', 10);
    expect(level).toBeGreaterThanOrEqual(76);

    // The sensors drive their inputs: the panel shows them as plant-driven.
    await page.getByRole('tab', { name: 'Tablero E/S' }).click();
    await expect(page.locator('[data-input="I0.2"] [data-from-plant]')).toBeVisible();
    await expect(page.locator('[data-input="I0.3"] [data-from-plant]')).toBeVisible();
  });

  test('motor: start, overload trip and reset', async ({ page }) => {
    await openExample(page, 'motor-start-stop');
    await run(page);
    const start = page.getByRole('button', { name: /Pulsador NA I0\.0 MARCHA/ });
    await start.click();
    await expect(page.getByTestId('plant-contactor')).toHaveAttribute('data-on', 'true');
    await expect(page.getByTestId('plant-speed')).toHaveText('100 %', { timeout: 5000 });

    await page.getByRole('button', { name: 'Simular sobrecarga' }).click();
    await expect(page.getByTestId('plant-relay')).toHaveAttribute('data-tripped', 'true');
    await expect(page.getByTestId('plant-contactor')).toHaveAttribute('data-on', 'false');
    await start.click();
    await expect(page.getByTestId('plant-contactor')).toHaveAttribute('data-on', 'false');

    await page.getByRole('button', { name: 'Rearmar relé térmico' }).click();
    await start.click();
    await expect(page.getByTestId('plant-contactor')).toHaveAttribute('data-on', 'true');
  });

  test('traffic lights: street A green first, never two greens', async ({ page }) => {
    await openExample(page, 'traffic-light');
    await run(page);
    await page.getByRole('switch', { name: /MARCHA/ }).click();
    await expect(light(page, 'a-green')).toHaveAttribute('data-on', 'true');
    await expect(light(page, 'b-red')).toHaveAttribute('data-on', 'true');
    for (let i = 0; i < 6; i++) {
      const [a, b] = await Promise.all([
        light(page, 'a-green').getAttribute('data-on'),
        light(page, 'b-green').getAttribute('data-on'),
      ]);
      expect(a === 'true' && b === 'true').toBe(false);
      await page.waitForTimeout(250);
    }
  });

  test('File menu loads an example', async ({ page }) => {
    await page.goto('/en/simulator');
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByTestId('menu-example-lamp-switch').click();
    await expect(page.getByTestId('project-name')).toHaveValue('Turn on a lamp with a switch');
    await expect(page.locator('[data-plant="lamp"]')).toBeVisible();
    await run(page);
    await page.getByRole('switch', { name: /SWITCH/ }).click();
    await expect(page.getByTestId('plant-lamp-bulb')).toHaveAttribute('data-on', 'true');
  });

  test('screenshots of the plants (light and dark)', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openExample(page, 'tank-filling');
      await run(page);
      await page.getByRole('switch', { name: /SISTEMA/ }).click();
      await expect(page.getByTestId('plant-sensor-low')).toHaveAttribute('data-on', 'true', {
        timeout: 5000,
      });
      await page.screenshot({ path: `test-results/screens/phase7-sim-tank-${scheme}.png` });

      await openExample(page, 'motor-start-stop');
      await run(page);
      await page.getByRole('button', { name: /Pulsador NA I0\.0 MARCHA/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/screens/phase7-sim-motor-${scheme}.png` });

      await openExample(page, 'traffic-light');
      await run(page);
      await page.getByRole('switch', { name: /MARCHA/ }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/screens/phase7-sim-traffic-${scheme}.png` });
    }
  });
});
