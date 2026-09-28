import { defineConfig, devices } from '@playwright/test';

// Separate port from `npm run dev` (4321) so tests never reuse a running dev server.
const PORT = 4330;
// Use the locally installed Edge (always present on Windows) instead of downloading Chromium.
// Override with PW_CHANNEL=chrome, or PW_CHANNEL= (empty) to use Playwright's bundled browser.
const channel = process.env['PW_CHANNEL'] ?? 'msedge';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env['CI'],
  },
});
