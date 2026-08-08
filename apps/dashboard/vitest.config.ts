import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domio/chart': resolve(here, '../../packages/chart/src/index.ts'),
      '@domio/observability': resolve(here, '../../packages/observability/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    pool: 'threads',
  },
});