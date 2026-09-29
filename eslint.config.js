import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'coverage/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The PLC engine and IR must stay pure TypeScript (spec section 2): no UI, no DOM, no timers.
    files: [
      'src/simulator/engine/**/*.ts',
      'src/simulator/ir/**/*.ts',
      'src/simulator/plants/*.ts',
      'src/simulator/challenges/validator.ts',
    ],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*'],
              message: 'The engine must not depend on React.',
            },
            {
              group: ['astro', 'astro:*', 'zustand'],
              message: 'The engine must not depend on UI code.',
            },
            {
              group: ['@/components/*', '@/layouts/*', '@/pages/*', '@/i18n', '@/i18n/*'],
              message: 'The engine must not depend on UI code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator'].map((name) => ({
          name,
          message: 'The engine must not touch the browser.',
        })),
        ...['setTimeout', 'setInterval', 'requestAnimationFrame', 'Date'].map((name) => ({
          name,
          message: 'The engine uses simulated time only.',
        })),
      ],
    },
  },
);
