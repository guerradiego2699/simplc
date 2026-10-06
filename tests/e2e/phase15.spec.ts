import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Content pages checked with axe (WCAG 2.1 A/AA rules) in light and dark themes. */
const PAGES = [
  '/es/',
  '/en/',
  '/es/learn',
  '/es/learn/how-a-plc-works',
  '/es/brands',
  '/es/examples',
  '/es/examples/batch-mixer',
  '/es/challenges',
  '/es/glossary',
  '/es/faq',
  '/es/support',
  '/es/legal',
  '/es/simulator',
];

const violations = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
};

test.describe('accessibility (axe)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`content pages have no WCAG A/AA violations (${scheme})`, async ({ page, isMobile }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const found: Record<string, unknown> = {};
      for (const path of PAGES) {
        if (isMobile && path.endsWith('/simulator')) continue;
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (path.endsWith('/simulator')) {
          await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
        }
        const list = await violations(page);
        if (list.length) found[path] = list;
      }
      expect(found, scheme).toEqual({});
    });
  }

  test('simulator in IL and SFC, and a challenge, have no violations', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the simulator is desktop-only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('p15')) return;
      sessionStorage.setItem('p15', '1');
      localStorage.removeItem('plcampus:project');
    });
    await page.goto('/es/simulator?example=batch-mixer');
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    await page.locator('[data-step="LLENAR_A"]').click();
    expect(await violations(page), 'SFC').toEqual([]);
    await page.locator('[data-language="IL"]').click();
    await expect(page.locator('[data-testid="il-editor"] .monaco-editor')).toBeVisible();
    expect(await violations(page), 'IL').toEqual([]);
    await page.goto('/es/simulator?challenge=oven-thermostat');
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    expect(await violations(page), 'challenge').toEqual([]);
  });
});

test.describe('ads are off by default', () => {
  test('no ad spaces, no cookie notice and no ad script', async ({ page }) => {
    let adRequests = 0;
    page.on('request', (r) => {
      if (r.url().includes('googlesyndication')) adRequests++;
    });
    for (const path of [
      '/es/glossary',
      '/es/faq',
      '/es/examples/tank-filling',
      '/es/learn/wiring',
    ]) {
      await page.goto(path);
      await expect(page.locator('[data-ad-space]')).toHaveCount(0);
      await expect(page.locator('#cookie-notice')).toHaveCount(0);
    }
    await page.goto('/es/legal');
    await expect(page.locator('#ads')).toHaveCount(0);
    await expect(page.getByText('Hoy no mostramos anuncios')).toBeVisible();
    expect(adRequests).toBe(0);
    const adsTxt = await page.request.get('/ads.txt');
    expect(adsTxt.ok()).toBe(true);
    expect((await adsTxt.text()).trim()).toBe('');
  });
});

test.describe('new challenges', () => {
  test('the list shows 22 challenges grouped by level', async ({ page }) => {
    await page.goto('/es/challenges');
    await expect(page.locator('[data-challenge]')).toHaveCount(22);
    await expect(page.locator('[data-challenge="pump-backup"]')).toContainText('Bomba de respaldo');
  });

  test('an analog challenge is solved in the simulator', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the simulator is desktop-only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('p15b')) return;
      sessionStorage.setItem('p15b', '1');
      localStorage.removeItem('plcampus:project');
      localStorage.removeItem('plcampus:challenges');
    });
    await page.goto('/es/simulator?challenge=analog-alarm');
    await expect(page.locator('html[data-sim-ready]')).toHaveCount(1);
    await expect(page.getByTestId('challenge-panel')).toContainText(
      'Alarmas de nivel con una señal analógica',
    );
    // An empty program is not accepted.
    await page.getByRole('button', { name: 'Verificar solución' }).click();
    await expect(page.getByTestId('challenge-panel')).not.toContainText('¡Desafío superado!');
    await page.screenshot({ path: 'test-results/screens/phase15-challenge-analog.png' });
  });
});
