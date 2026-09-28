// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // Keep in sync with SITE.url in src/config/site.ts (used for canonical and hreflang URLs).
  site: 'https://plcampus.com',
  trailingSlash: 'ignore',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      prefixDefaultLocale: true,
      // The root page (src/pages/index.astro) picks the locale from the browser itself.
      redirectToDefaultLocale: false,
    },
  },
  // Code blocks in Learn pages are ASCII diagrams; themed highlighting arrives with ST (Phase 11).
  markdown: { syntaxHighlight: false },
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
