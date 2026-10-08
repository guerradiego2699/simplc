import { expect, test, type Page } from '@playwright/test';

/** Bugs reported after the phases were finished; each test reproduces one. */

const status = (page: Page) =>
  page.evaluate(() => document.body.innerText.match(/\n(RUN|STOP|PAUSA)\n/)?.[1]);
const simTime = (page: Page) =>
  page.evaluate(() => document.body.innerText.match(/Tiempo ([\d,]+) s/)?.[1]);

test.describe('switching projects while the PLC runs', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('regressions')) return;
      sessionStorage.setItem('regressions', '1');
      localStorage.removeItem('plcampus:project');
    });
  });

  const load = async (page: Page, id: string) => {
    await page.getByRole('button', { name: 'Archivo' }).click();
    await page.getByTestId(`menu-example-${id}`).click();
  };
  const run = (page: Page) => page.getByRole('button', { name: 'Ejecutar (F5)' }).click();

  test('nothing of the previous example leaks into the next one (load, undo, redo)', async ({
    page,
  }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/es/simulator');
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);

    // Traffic light running with its switch on (it writes Q0.4, the mixer's "batch done").
    await load(page, 'traffic-light');
    await page.getByLabel('Velocidad').selectOption('4');
    await run(page);
    await page.getByRole('switch', { name: /MARCHA/ }).click();
    await page.waitForTimeout(1000);

    // Loading another example stops a clean PLC: time back at 0, the switch is not carried over.
    await load(page, 'batch-mixer');
    await expect.poll(() => status(page)).toBe('STOP');
    expect(await simTime(page)).toBe('0,00');
    await run(page);
    await expect(page.getByTestId('notice')).toHaveCount(0); // "press Run" hint closes
    await page.getByRole('button', { name: /Pulsador NA I0\.0 MARCHA/ }).click();
    await expect(page.locator('[data-step="LLENAR_A"]')).toHaveAttribute('data-active', 'true');

    // Undo back to the traffic light WHILE RUNNING: no online change into another project.
    await page.locator('[data-testid="sfc-editor"]').click({ position: { x: 600, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect.poll(() => status(page)).toBe('STOP');
    await expect(page.getByRole('switch', { name: /MARCHA/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    await page.keyboard.press('Control+y');
    await expect.poll(() => status(page)).toBe('STOP');
    await run(page);
    await page.waitForTimeout(300);
    await expect(page.locator('[data-step="REPOSO"]')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('plant-done-light')).toHaveAttribute('data-on', 'false');
  });
});
