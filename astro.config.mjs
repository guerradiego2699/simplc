// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  // TODO: replace with the real domain once it is purchased (used for sitemap, canonical and hreflang).
  site: 'https://example.com',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
