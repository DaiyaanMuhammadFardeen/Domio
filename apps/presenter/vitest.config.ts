import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    environmentMatchGlobs: [
      ['src/lib/**', 'node'],
      ['src/runtime/timer.test.ts', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@domio/presenter-runtime': path.resolve(__dirname, 'src/runtime'),
      '@domio/ui': path.resolve(here, '../../packages/ui/src/index.ts'),
    },
  },
});
