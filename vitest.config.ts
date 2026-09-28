import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      include: ['src/simulator/**', 'src/i18n/**', 'src/components/content/widgets/**'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
      reporter: ['text', 'html'],
    },
  },
});
