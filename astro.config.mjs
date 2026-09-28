// @ts-check
import { defineConfig } from 'astro/config';
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
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
