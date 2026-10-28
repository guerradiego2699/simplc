// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import stGrammar from './src/lib/shiki/st.tmLanguage.json' with { type: 'json' };
import { plcampusTheme } from './src/lib/shiki/theme.mjs';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

/** "https://x/es/learn/" → "https://x/es/learn"; locale home pages keep their slash. */
/** @param {string} url */
const canonicalUrl = (url) => (/\/(es|en)\/$/.test(url) ? url : url.replace(/\/$/, ''));

/**
 * Dev only: serves the Vercel functions in api/ (on Vercel they run as serverless functions).
 * Each file exports handlers named after HTTP methods: (Request) => Response.
 * @type {import('astro').AstroIntegration}
 */
const vercelFunctionsDev = {
  name: 'plcampus:vercel-functions-dev',
  hooks: {
    'astro:server:setup': ({ server }) => {
      Object.assign(
        process.env,
        loadEnv('development', fileURLToPath(new URL('.', import.meta.url)), ''),
      );
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (!/^\/api\/[\w/-]+$/.test(path)) return next();
        try {
          const handler = (await server.ssrLoadModule(`${path}.ts`))[req.method ?? 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            res.end();
            return;
          }
          /** @type {Buffer[]} */
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
          }
          /** @type {Response} */
          const response = await handler(
            new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method ?? 'GET',
              headers,
              ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  },
};

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
    vercelFunctionsDev,
    react(),
    mdx(),
    sitemap({
      // The root page only redirects to /es/ or /en/; the private lab is not for search engines.
      filter: (page) => !/^\/((es|en)\/lab\/?)?$/.test(new URL(page).pathname),
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
