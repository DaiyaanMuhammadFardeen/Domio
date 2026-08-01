import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
      '@domio/canvas': resolve(here, '../../packages/canvas/src/index.ts'),
      '@domio/common': resolve(here, '../../packages/common/src/index.ts'),
      '@domio/schema': resolve(here, '../../packages/schema/src/index.ts'),
      '@domio/sdk': resolve(here, '../../packages/sdk-ts/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    environment: 'node',
  },
});