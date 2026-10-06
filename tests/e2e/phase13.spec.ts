import { expect, test, type Page } from '@playwright/test';

/** Starts the PLC with the toolbar button. */
const run = (page: Page) => page.getByRole('button', { name: /^(Ejecutar|Run) \(F5\)$/ }).click();

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

const NEW_EXAMPLES = [
  ['reversing-motor', 'reversing'],
  ['automatic-gate', 'gate'],
  ['star-delta', 'starDelta'],
  ['conveyor-counter', 'conveyor'],
  ['car-park', 'parking'],
  ['size-sorter', 'sorter'],
  ['two-pumps', 'pumps'],
  ['oven-temperature', 'oven'],
  ['level-control', 'levelControl'],
] as const;

test.describe('new example pages', () => {
  test('gallery shows all 14 examples', async ({ page }) => {
    await page.goto('/es/examples');
    await expect(page.locator('[data-example]')).toHaveCount(14);
    await expect(page.getByRole('link', { name: 'Portón automático' })).toHaveAttribute(
      'href',
      '/es/examples/automatic-gate',
    );
    await noHorizontalScroll(page);
  });

  test('every new example page shows its plant, I/O table and program', async ({ page }) => {
    for (const [id, plant] of NEW_EXAMPLES) {
      await page.goto(`/en/examples/${id}`);
      await expect(page.locator(`figure[data-plant="${plant}"]`)).toBeVisible();
      await expect(page.locator('table tbody tr').first()).toBeVisible();
      await expect(page.locator('[data-panel="LD"] svg').first()).toBeVisible();
      await noHorizontalScroll(page);
    }
  });

  test('screenshots of example pages (light and dark)', async ({ page }, info) => {
    const device = info.project.name;
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const id of ['star-delta', 'level-control']) {
        await page.goto(`/es/examples/${id}`);
        await page.screenshot({
          path: `test-results/screens/phase13-${id}-${device}-${scheme}.png`,
          fullPage: true,
        });
      }
    }
  });
});

test.describe('new plants in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('plcampus:project'));
  });

  const openExample = async (page: Page, id: string, speed = '4') => {
    await page.goto(`/es/simulator?example=${id}`);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    await page.getByLabel('Velocidad').selectOption(speed);
  };
  const plant = (page: Page, id: string) => page.getByTestId(`plant-${id}`);
  const press = (page: Page, name: string) =>
    page.getByRole('button', { name: new RegExp(`Pulsador N[AC] I0\\.\\d ${name}$`) }).click();

  test('reversing motor: the electrical interlock blocks the other direction', async ({ page }) => {
    await openExample(page, 'reversing-motor');
    await run(page);
    await press(page, 'ADELANTE');
    await expect(plant(page, 'km-forward')).toHaveAttribute('data-on', 'true');
    await press(page, 'ATRAS');
    await expect(plant(page, 'km-reverse')).toHaveAttribute('data-on', 'false');
    await expect(plant(page, 'km-forward')).toHaveAttribute('data-on', 'true');
    await press(page, 'PARO');
    await expect(plant(page, 'km-forward')).toHaveAttribute('data-on', 'false');
    await press(page, 'ATRAS');
    await expect(plant(page, 'km-reverse')).toHaveAttribute('data-on', 'true');
    await expect(plant(page, 'direction')).toContainText('Atrás', { timeout: 5000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('gate: opens to the limit and reopens when the photocell is blocked', async ({ page }) => {
    await openExample(page, 'automatic-gate');
    await run(page);
    await press(page, 'ABRIR');
    await expect(plant(page, 'ls-open')).toHaveAttribute('data-on', 'true', { timeout: 8000 });
    await press(page, 'CERRAR');
    await expect(plant(page, 'ls-open')).toHaveAttribute('data-on', 'false');
    await page.getByRole('button', { name: 'Poner obstáculo' }).click();
    await expect(plant(page, 'photocell')).toHaveAttribute('data-clear', 'false');
    await expect(plant(page, 'ls-open')).toHaveAttribute('data-on', 'true', { timeout: 8000 });
    await expect(page.getByText('¡El portón golpeó el obstáculo!')).toHaveCount(0);
  });

  test('star-delta: star first, then delta, never both', async ({ page }) => {
    await openExample(page, 'star-delta');
    await run(page);
    await press(page, 'MARCHA');
    await expect(plant(page, 'k1')).toHaveAttribute('data-on', 'true');
    await expect(plant(page, 'k2')).toHaveAttribute('data-on', 'true');
    await expect(plant(page, 'k3')).toHaveAttribute('data-on', 'true', { timeout: 8000 });
    await expect(plant(page, 'k2')).toHaveAttribute('data-on', 'false');
    const peak = Number(await plant(page, 'peak').getAttribute('data-peak'));
    expect(peak).toBeLessThan(4);
  });

  test('oven: the temperature transmitter drives IW0 (analog input from the plant)', async ({
    page,
  }) => {
    await openExample(page, 'oven-temperature');
    await run(page);
    await page.getByRole('switch', { name: /ENCENDIDO/ }).click();
    await expect(plant(page, 'heater')).toHaveAttribute('data-on', 'true');
    await expect
      .poll(async () => Number.parseInt((await plant(page, 'temp').textContent()) ?? '', 10), {
        timeout: 8000,
      })
      .toBeGreaterThan(40);
    await page.getByRole('tab', { name: 'Tablero E/S' }).click();
    const iw0 = page.locator('[data-analog-input="IW0"]');
    await expect(iw0.locator('[data-from-plant]')).toBeVisible();
    await expect(iw0.getByRole('slider')).toBeDisabled();
    expect(Number(await iw0.getByRole('slider').inputValue())).toBeGreaterThan(3000);
  });

  test('level control: the program opens the proportional valve through QW0', async ({ page }) => {
    await openExample(page, 'level-control');
    await run(page);
    await page.getByRole('switch', { name: /CONTROL/ }).click();
    await expect
      .poll(async () => Number(await plant(page, 'valve').getAttribute('data-opening')))
      .toBeGreaterThan(50);
    await expect
      .poll(async () => Number.parseInt((await plant(page, 'level').textContent()) ?? '', 10), {
        timeout: 10_000,
      })
      .toBeGreaterThan(30);
    await page.getByRole('tab', { name: 'Tablero E/S' }).click();
    const meter = page.locator('[data-analog-output="QW0"]').getByRole('meter');
    expect(Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    // Switching the control off closes the valve.
    await page.getByRole('switch', { name: /CONTROL/ }).click();
    await expect(meter).toHaveAttribute('aria-valuenow', '0');
  });

  test('analog board: potentiometers set IW0 without a plant', async ({ page }) => {
    await page.goto('/es/simulator');
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Tablero E/S' }).click();
    const iw1 = page.locator('[data-analog-input="IW1"]');
    await iw1.getByRole('slider').fill('13824');
    await expect(iw1).toContainText('13824 · 50 %');
    await run(page);
    await page.screenshot({ path: 'test-results/screens/phase13-analog-board-light.png' });
  });

  test('car park: cars enter until it is full', async ({ page }) => {
    await openExample(page, 'car-park');
    await run(page);
    const arrive = page.getByRole('button', { name: 'Llega un auto' });
    for (let i = 0; i < 3; i++) await arrive.click();
    await expect(plant(page, 'parked')).toHaveText('Estacionados: 3 de 10', { timeout: 10_000 });
    await expect(plant(page, 'full-sign')).toHaveAttribute('data-on', 'false');
  });

  test('screenshots of the new plants (light and dark)', async ({ page }) => {
    test.setTimeout(180_000);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [id, name] of NEW_EXAMPLES) {
        await openExample(page, id);
        await run(page);
        const start = page.getByRole('button', { name: /Pulsador NA I0\.0 / });
        const toggle = page.getByRole('switch', { name: /I0\.0 / });
        if (await start.count()) await start.first().click();
        else if (await toggle.count()) await toggle.first().click();
        if (name === 'parking') {
          for (let i = 0; i < 2; i++)
            await page.getByRole('button', { name: 'Llega un auto' }).click();
        }
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `test-results/screens/phase13-sim-${name}-${scheme}.png` });
      }
    }
  });
});
