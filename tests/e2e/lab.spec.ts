import { expect, test } from '@playwright/test';

// `astro preview` does not run the Vercel functions in api/, so the API is mocked here; the
// functions themselves are covered by the unit tests in src/lib/lab/.
test('lab: login, agent turn with tool calls and purchase order', async ({ page }) => {
  let authenticated = false;
  await page.route('**/api/lab/session', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const { password } = request.postDataJSON() as { password: string };
      authenticated = password === 'right';
      return route.fulfill({ status: authenticated ? 200 : 401, json: { authenticated } });
    }
    return route.fulfill({ json: { configured: true, authenticated } });
  });
  await page.route('**/api/lab/chat', (route) =>
    route.fulfill({
      json: {
        reply: 'Orden emitida: **OC-0001** por 7 laptops.',
        state: 'signed-token',
        inventory: {
          stock: { laptops: 3 },
          orders: [{ id: 'OC-0001', product: 'laptops', quantity: 7 }],
        },
        events: [
          { type: 'call', name: 'consultar_stock', args: { producto: 'laptops' } },
          { type: 'result', name: 'consultar_stock', result: { producto: 'laptops', stock: 3 } },
          { type: 'order', id: 'OC-0001', product: 'laptops', quantity: 7 },
        ],
      },
    }),
  );

  const response = await page.goto('/es/lab');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Pruebas: agente logístico con IA',
  );

  await page.getByLabel('Usuario').fill('demo');
  await page.getByLabel('Contraseña').fill('wrong');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Usuario o contraseña incorrectos.');

  await page.getByLabel('Contraseña').fill('right');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('[data-lab-workspace]')).toBeVisible();

  await page
    .getByRole('button', { name: 'Necesitamos equipar a 10 nuevos empleados con laptops' })
    .click();
  await expect(page.locator('[data-role="agent"] strong')).toHaveText('OC-0001');
  await expect(page.locator('[data-lab-console]')).toContainText(
    '→ consultar_stock({"producto":"laptops"})',
  );
  await expect(page.locator('[data-lab-console]')).toContainText(
    '[SISTEMA] Orden OC-0001 emitida: 7 x laptops',
  );
  await expect(page.locator('[data-lab-inventory]')).toContainText('7 × laptops');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.locator('[data-lab-login]')).toBeVisible();
});

test('lab: hidden from search engines and linked only from the footer', async ({
  page,
  request,
}) => {
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('/lab');
  await page.goto('/es/');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Pruebas' })).toHaveCount(0);
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Pruebas' }),
  ).toHaveAttribute('href', '/es/lab');
});
