import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@domio/presenter-runtime': path.resolve(__dirname, 'src/runtime'),
    },
  },
});