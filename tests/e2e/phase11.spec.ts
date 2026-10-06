import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.describe('Structured Text in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phase11-init')) return;
      sessionStorage.setItem('phase11-init', '1');
      localStorage.removeItem('plcampus:project');
    });
  });

  const open = async (page: Page, lang = 'es') => {
    await page.goto(`/${lang}/simulator`);
    await expect(page.getByTestId('simulator')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  /** Text shown by Monaco (it renders spaces as non-breaking spaces). */
  const editorText = async (page: Page) =>
    ((await page.locator('[data-testid="st-editor"] .view-lines').innerText()) ?? '').replace(
      /\u00a0/g,
      ' ',
    );
  const toSt = async (page: Page) => {
    await page.locator('[data-language="ST"]').click();
    await expect(page.locator('[data-testid="st-editor"] .monaco-editor')).toBeVisible();
  };

  test('switching to ST converts the Ladder program and it runs the same', async ({ page }) => {
    await open(page);
    await toSt(page);
    await expect(page.getByTestId('notice')).toContainText('Convertimos tu programa Ladder');
    await expect(page.locator('[data-language="ST"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await editorText(page)).toContain('MOTOR := (MARCHA OR MOTOR) AND PARO;');
    await expect(page.locator('[data-snippet]').first()).toBeVisible(); // snippets replace palette
    await expect(page.getByTestId('st-help')).toBeVisible();
    await expect(page.getByText('0 errores')).toBeVisible();

    await page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
    const start = page.locator('[data-input="I0.0"] button');
    const box = await start.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(page.locator('[data-output="Q0.0"] [data-on="true"]')).toBeVisible();
    // Live value next to the assignment.
    await expect(page.locator('.st-live-value').first()).toContainText('MOTOR = 1');
  });

  test('errors are underlined, listed with line and column, and fixed live', async ({ page }) => {
    await open(page);
    await toSt(page);
    await page.locator('[data-testid="st-editor"] .view-lines').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nQ0.5 := DESCONOCIDO;');
    await expect(page.getByText('1 errores')).toBeVisible();
    await page.getByRole('tab', { name: 'Consola' }).click();
    const item = page.locator('[data-st-diagnostic="ST_UNKNOWN_NAME"]');
    await expect(item).toContainText('«DESCONOCIDO» no está declarado');
    await expect(item).toContainText(/Línea \d+, col\. 9/);
    await expect(page.locator('[data-testid="st-editor"] .squiggly-error')).toHaveCount(1);

    await page.locator('[data-testid="st-editor"] .view-lines').click();
    await page.keyboard.press('Control+End');
    for (let k = 0; k < 'DESCONOCIDO;'.length; k++) await page.keyboard.press('Backspace');
    await page.keyboard.type('TRUE;');
    await expect(page.getByText('0 errores')).toBeVisible();
  });

  test('snippets insert at the cursor; switching languages keeps both programs', async ({
    page,
  }) => {
    await open(page);
    await toSt(page);
    await page.locator('[data-testid="st-editor"] .view-lines').click();
    await page.keyboard.press('Control+End');
    await page.locator('[data-snippet="if"]').click();
    await expect.poll(() => editorText(page)).toContain('IF condicion THEN');

    await page.locator('[data-language="LD"]').click();
    await expect(page.getByTestId('notice')).toContainText('Volviste al programa Ladder');
    await expect(page.locator('[data-element]')).toHaveCount(4);

    // Back to ST: the existing ST program can be kept.
    await page.locator('[data-language="ST"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Mantener mi ST' }).click();
    await expect.poll(() => editorText(page)).toContain('IF condicion THEN');

    // Undo goes back to Ladder.
    await page.getByRole('button', { name: 'Deshacer (Ctrl+Z)' }).click();
    await expect(page.locator('[data-element]')).toHaveCount(4);
  });

  test('the ST program survives a reload and exports as .st', async ({ page }) => {
    await open(page);
    await toSt(page);
    await page.waitForTimeout(700); // autosave
    await page.reload();
    await expect(page.locator('[data-testid="st-editor"] .monaco-editor')).toBeVisible();
    expect(await editorText(page)).toContain('MOTOR := (MARCHA OR MOTOR) AND PARO;');

    await page.getByRole('button', { name: 'Archivo' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('menu-export-st').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.st$/);
    const content = await readFile((await download.path())!, 'utf8');
    expect(content).toContain('MOTOR := (MARCHA OR MOTOR) AND PARO;');
  });

  test('challenges stay in Ladder', async ({ page }) => {
    await page.goto('/es/simulator?challenge=first-output');
    await expect(page.getByTestId('challenge-panel')).toBeVisible();
    await expect(page.locator('[data-language="ST"]')).toBeDisabled();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshot of the ST editor running (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await open(page);
      await toSt(page);
      await page.getByRole('button', { name: 'Cerrar aviso' }).click();
      await page.getByRole('button', { name: 'Ejecutar (F5)' }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/screens/phase11-st-${scheme}.png` });
    });
  }
});

test('Learn: ST code blocks are highlighted with the site colours', async ({ page }) => {
  await page.goto('/es/learn/iec-61131-3-languages');
  const block = page.locator('pre[data-language="st"]');
  await expect(block).toBeVisible();
  await expect(block.locator('span', { hasText: /^IF$/ })).toHaveAttribute(
    'style',
    /var\(--primary\)/,
  );
});
