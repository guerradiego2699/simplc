// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import stGrammar from './src/lib/shiki/st.tmLanguage.json' with { type: 'json' };
import { plcampusTheme } from './src/lib/shiki/theme.mjs';
import tailwindcss from '@tailwindcss/vite';

/** "https://x/es/learn/" → "https://x/es/learn"; locale home pages keep their slash. */
/** @param {string} url */
const canonicalUrl = (url) => (/\/(es|en)\/$/.test(url) ? url : url.replace(/\/$/, ''));

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
  // ```st blocks are highlighted with our Structured Text grammar; other blocks (ASCII ladder
  // diagrams) stay plain. Colours come from CSS tokens (src/lib/shiki/theme.mjs).
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: plcampusTheme, langs: [stGrammar], wrap: false },
  },
  integrations: [
    react(),
    mdx(),
    sitemap({
      // The root page only redirects to /es/ or /en/.
      filter: (page) => new URL(page).pathname !== '/',
      i18n: { defaultLocale: 'es', locales: { es: 'es', en: 'en' } },
      // Match the canonical URLs (no trailing slash, except the /es/ and /en/ home pages).
      serialize: (item) => ({
        ...item,
        url: canonicalUrl(item.url),
        ...(item.links
          ? { links: item.links.map((link) => ({ ...link, url: canonicalUrl(link.url) })) }
          : {}),
      }),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle every client dependency at dev-server start. If Vite discovers one later, it
    // re-optimizes mid-session and islands can break with "_jsxDEV is not a function".
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'zustand',
        'zustand/react/shallow',
        'zod/mini',
        'lucide-react',
      ],
    },
  },
});
