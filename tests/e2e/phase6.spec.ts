import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.describe('saving and loading projects', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });

  const open = async (page: Page) => {
    await page.goto('/es/simulator');
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  const elements = (page: Page) => page.locator('[data-element]');
  const notice = (page: Page) => page.getByTestId('notice');

  /** A valid project file with one rung: I0.7 → Q0.7, named "Desde archivo". */
  const projectFile = JSON.stringify({
    format: 'plcampus-project',
    version: 1,
    project: {
      name: 'Desde archivo',
      language: 'LD',
      ladder: {
        rungs: [
          {
            comment: 'Cargado',
            logic: { items: [{ kind: 'contact', type: 'NO', operand: 'I0.7' }] },
            coils: [{ kind: 'coil', type: 'coil', operand: 'Q0.7' }],
          },
        ],
      },
      tags: [],
      io: { inputs: { 'I0.7': { label: 'PRUEBA' } }, outputs: {} },
      plant: null,
    },
  });

  test('autosave keeps the project after a reload', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-state', 'saved');
    await page.getByTestId('project-name').fill('Mi prueba');
    await page.getByRole('button', { name: '+ Agregar peldaño' }).click();
    await page.locator('[data-palette="NO"]').click();
    await page.getByTestId('operand-input').fill('I0.4');
    await expect(elements(page)).toHaveCount(5);

    await page.waitForTimeout(700); // autosave is debounced
    await page.reload();
    await expect(page.getByTestId('project-name')).toHaveValue('Mi prueba');
    await expect(elements(page)).toHaveCount(5);
    await expect(page.getByRole('button', { name: /: I0\.4/ })).toBeVisible();
  });

  test('Ctrl+S downloads a valid project file named after the project', async ({ page }) => {
    await open(page);
    await page.getByTestId('project-name').fill('Partida motor Nº1');
    await page.locator('[data-element]').first().click(); // focus outside the name field
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(download.suggestedFilename()).toBe('partida-motor-n-1.plcampus.json');
    const content = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(content).toMatchObject({ format: 'plcampus-project', version: 1 });
    expect(content.project.name).toBe('Partida motor Nº1');
    expect(content.project.ladder.rungs).toHaveLength(1);
    await expect(notice(page)).toContainText('partida-motor-n-1.plcampus.json');
  });

  test('opening a file replaces the project, and Ctrl+Z brings the old one back', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'desde-archivo.plcampus.json',
      mimeType: 'application/json',
      buffer: Buffer.from(projectFile),
    });
    await expect(notice(page)).toContainText('Proyecto «Desde archivo» abierto.');
    await expect(page.getByTestId('project-name')).toHaveValue('Desde archivo');
    await expect(elements(page)).toHaveCount(2);
    await expect(page.locator('[data-input="I0.7"]')).toContainText('PRUEBA');

    // It runs.
    await page.keyboard.press('F5');
    await page.locator('[data-input="I0.7"] [role="switch"]').click();
    await expect(page.locator('[data-output="Q0.7"] [data-on]')).toHaveAttribute('data-on', 'true');
    await page.keyboard.press('F6');

    await page.locator('[data-rung]').first().locator('[role="button"]').first().click();
    await page.keyboard.press('Control+z');
    await expect(elements(page)).toHaveCount(4); // back to the example
  });

  test('invalid files are rejected with a clear message and nothing changes', async ({ page }) => {
    await open(page);
    const input = page.getByTestId('project-file-input');
    await input.setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{oops'),
    });
    await expect(notice(page)).toHaveAttribute('data-kind', 'error');
    await expect(notice(page)).toContainText('no tiene un formato JSON válido');

    await input.setInputFiles({
      name: 'y.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"a":1}'),
    });
    await expect(notice(page)).toContainText('no es un proyecto de PLCampus');

    const broken = JSON.parse(projectFile);
    broken.project.ladder.rungs[0].coils[0].type = 'BOOM';
    await input.setInputFiles({
      name: 'z.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(broken)),
    });
    await expect(notice(page)).toContainText('project.ladder.rungs.0.coils.0.type');
    await expect(elements(page)).toHaveCount(4); // still the example
  });

  test('a project file can be dropped onto the simulator', async ({ page }) => {
    await open(page);
    await page.evaluate(async (content) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([content], 'drop.plcampus.json', { type: 'application/json' }));
      const target = document.querySelector('[data-testid="simulator"]')!;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      }
    }, projectFile);
    await expect(page.getByTestId('project-name')).toHaveValue('Desde archivo');
  });

  test('the simulator keeps working when browser storage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('SecurityError: storage blocked');
        },
      });
    });
    await open(page);
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-state', 'unavailable');
    await page.keyboard.press('F5');
    await page.locator('[data-input="I0.0"] button').first().click();
    await expect(page.locator('[data-output="Q0.0"] [data-on]')).toHaveAttribute('data-on', 'true');
  });

  test('screenshot with a notice (light and dark)', async ({ page }, testInfo) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.addInitScript(() => localStorage.removeItem('plcampus:project'));
      await open(page);
      await page.getByRole('button', { name: 'Archivo' }).click();
      await page.screenshot({
        path: `test-results/screens/phase6-menu-${scheme}-${testInfo.project.name}.png`,
      });
      await page.keyboard.press('Escape');
      await page.getByTestId('project-file-input').setInputFiles({
        name: 'x.json',
        mimeType: 'application/json',
        buffer: Buffer.from(projectFile),
      });
      await expect(notice(page)).toBeVisible();
      await page.screenshot({
        path: `test-results/screens/phase6-notice-${scheme}-${testInfo.project.name}.png`,
      });
    }
  });
});
