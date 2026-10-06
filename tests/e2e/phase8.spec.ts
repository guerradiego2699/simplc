import { expect, test, type Page } from '@playwright/test';

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

test.describe('challenges page', () => {
  test('lists the challenges and shows the progress saved in this browser', async ({ page }) => {
    await page.goto('/es/challenges');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Desafíos de programación PLC',
    );
    await expect(page.locator('[data-challenge]')).toHaveCount(22);
    await expect(page.locator('#challenge-progress')).toHaveText('Completados: 0 de 22');
    await noHorizontalScroll(page);

    await page.evaluate(() =>
      localStorage.setItem(
        'plcampus:challenges',
        JSON.stringify({ completed: { 'door-bell': '2026-01-01T00:00:00.000Z' } }),
      ),
    );
    await page.reload();
    await expect(page.locator('#challenge-progress')).toHaveText('Completados: 1 de 22');
    const card = page.locator('[data-challenge="door-bell"]');
    await expect(card.locator('[data-completed-badge]')).toBeVisible();
    await expect(
      page.locator('[data-challenge="first-output"] [data-completed-badge]'),
    ).toBeHidden();
  });

  test('works with blocked storage and in English', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await page.goto('/en/challenges');
    await expect(page.locator('#challenge-progress')).toHaveText('Completed: 0 of 22');
    await expect(page.getByRole('heading', { name: 'Start and stop with seal-in' })).toBeVisible();
  });

  test('screenshots (light and dark)', async ({ page }, testInfo) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/es/challenges');
      await page.screenshot({
        path: `test-results/screens/phase8-challenges-${scheme}-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
  });
});

test.describe('solving a challenge in the simulator', () => {
  test.skip(({ isMobile }) => isMobile, 'the simulator is desktop-only');
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('phase8-init')) return;
      sessionStorage.setItem('phase8-init', '1');
      localStorage.removeItem('plcampus:project');
      localStorage.removeItem('plcampus:challenges');
    });
  });

  const openChallenge = async (page: Page, id: string) => {
    await page.goto(`/es/simulator?challenge=${id}`);
    await expect(page.getByTestId('challenge-panel')).toBeVisible();
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
  };
  const result = (page: Page) => page.getByTestId('challenge-result');

  test('first challenge: limited palette, wrong answer explained, then solved', async ({
    page,
  }) => {
    await openChallenge(page, 'first-output');
    await expect(page).toHaveURL(/\/es\/simulator$/);
    await expect(page.getByRole('tab', { name: 'Desafío' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('project-name')).toHaveValue('Enciende una lámpara');
    await expect(page.locator('[data-palette]')).toHaveCount(2);

    // Empty program.
    await page.getByTestId('challenge-verify').click();
    await expect(result(page)).toHaveAttribute('data-status', 'invalid');

    // Hints appear one at a time.
    await page.getByRole('button', { name: 'Ver pista 1 de 3' }).click();
    await expect(page.getByText('Pista 1:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver pista 2 de 3' })).toBeVisible();

    // Wrong output.
    await page.locator('[data-palette="NO"]').click();
    await page.getByTestId('operand-input').fill('PULSADOR');
    await page.locator('[data-palette="coil"]').click();
    await page.getByTestId('operand-input').fill('Q0.1');
    await page.getByRole('tab', { name: 'Desafío' }).click();
    await page.getByTestId('challenge-verify').click();
    await expect(result(page)).toHaveAttribute('data-status', 'failed');
    await expect(result(page)).toContainText('Aprobaste 1 de 3 casos de prueba');
    await expect(result(page)).toContainText(
      'En t = 0,15 s se esperaba LAMPARA (Q0.0) = 1, pero estaba en 0.',
    );

    // Fix it.
    await page.locator('[data-element][data-type="coil"]').click();
    await page.getByTestId('operand-input').fill('LAMPARA');
    await page.getByRole('tab', { name: 'Desafío' }).click();
    await expect(
      page.getByText('Cambiaste el programa desde la última verificación.'),
    ).toBeVisible();
    await page.getByTestId('challenge-verify').click();
    await expect(result(page)).toHaveAttribute('data-status', 'passed');
    await expect(page.getByTestId('challenge-completed')).toBeVisible();

    // Progress is saved and the challenge can be resumed.
    await page.waitForTimeout(700); // autosave is debounced
    await openChallenge(page, 'first-output');
    await expect(page.getByTestId('notice')).toContainText('Continúas con el desafío');
    await expect(page.locator('[data-element]')).toHaveCount(2);
    await expect(page.getByTestId('challenge-completed')).toBeVisible();

    // Next challenge.
    await page.getByTestId('challenge-verify').click();
    await page.getByTestId('challenge-next').click();
    await expect(page.getByTestId('project-name')).toHaveValue('Luces de marcha y detención');
    await expect(page.locator('[data-palette]')).toHaveCount(3);

    await page.goto('/es/challenges');
    await expect(page.locator('#challenge-progress')).toHaveText('Completados: 1 de 22');
  });

  test('instructions outside the allowed list are rejected', async ({ page }) => {
    await openChallenge(page, 'first-output');
    await page.locator('[data-palette="NO"]').click();
    await page.getByTestId('operand-input').fill('I0.0');
    await page.locator('[data-palette="coil"]').click();
    await page.getByTestId('operand-input').fill('Q0.0');
    // Change the coil to a set coil from the properties panel.
    await page.getByRole('combobox', { name: 'Tipo' }).selectOption('set');
    await page.getByRole('tab', { name: 'Desafío' }).click();
    await page.getByTestId('challenge-verify').click();
    await expect(result(page)).toContainText('Este desafío no permite estas instrucciones');
  });

  test('a challenge with a plant opens the plant tab', async ({ page }) => {
    await openChallenge(page, 'motor-seal-in');
    await expect(page.getByText('Este desafío usa la planta virtual')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Planta virtual' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('[data-plant="motor"]')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`screenshot of the challenge panel (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openChallenge(page, 'two-hand-control');
      await page.getByRole('button', { name: 'Ver pista 1 de 3' }).click();
      await page.locator('[data-palette="NO"]').click();
      await page.getByTestId('operand-input').fill('MANO_IZQ');
      await page.locator('[data-palette="coil"]').click();
      await page.getByTestId('operand-input').fill('PRENSA');
      await page.getByRole('tab', { name: 'Desafío' }).click();
      await page.getByTestId('challenge-verify').click();
      await expect(result(page)).toHaveAttribute('data-status', 'failed');
      await expect(result(page)).toBeInViewport();
      await page.screenshot({ path: `test-results/screens/phase8-sim-challenge-${scheme}.png` });
    });
  }
});
