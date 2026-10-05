/**
 * Generates public/og-image.png (1200×630), the preview image shown when a page is shared.
 * Run with `npm run og:image` after changing the site name or taglines. Uses the installed
 * Microsoft Edge through Playwright, like the e2e tests.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { SITE } from '../src/config/site';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';

const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');

// Colours mirror the dark theme tokens in src/styles/tokens.css.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1200px; height: 630px; background: #0f172a; color: #e6ecf5;
    font-family: 'Segoe UI', system-ui, sans-serif; display: flex; flex-direction: column;
    justify-content: center; padding: 0 96px; box-sizing: border-box;
    background-image: linear-gradient(#1a2640 1px, transparent 1px),
      linear-gradient(90deg, #1a2640 1px, transparent 1px);
    background-size: 48px 48px; }
  .brand { display: flex; align-items: center; gap: 28px; }
  .brand svg { width: 120px; height: 120px; }
  h1 { font-size: 96px; margin: 0; letter-spacing: -2px; }
  p { margin: 18px 0 0; font-size: 38px; color: #9aa8bf; }
  .rung { margin-top: 56px; height: 6px; width: 520px; background: #4c86e8; border-radius: 3px; }
</style></head><body>
  <div class="brand">${logo}<h1>${SITE.name}</h1></div>
  <p>${es.meta.homeTitle}</p>
  <p>${en.meta.homeTitle}</p>
  <div class="rung"></div>
</body></html>`;

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: 'public/og-image.png' });
await browser.close();
console.log('public/og-image.png written');
