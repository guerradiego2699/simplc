import { expect, test } from '@playwright/test';

test('home renders and React island hydrates', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SimPLC');

  const island = page.getByTestId('hello-island');
  await expect(island).toHaveText('React island: 0');
  await island.click();
  await expect(island).toHaveText('React island: 1');

  await page.screenshot({ path: `test-results/screens/phase0-home-${testInfo.project.name}.png` });
});
