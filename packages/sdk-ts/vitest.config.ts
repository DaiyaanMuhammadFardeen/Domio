import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@domio/common', replacement: resolve(here, '../common/src/index.ts') },
      { find: /^@domio\/schema$/, replacement: resolve(here, '../schema/src/index.ts') },
      { find: /^@domio\/schema\/generated\/scene-graph$/, replacement: resolve(here, '../schema/src/generated/scene-graph.ts') },
      { find: /^@domio\/schema\/contracts$/, replacement: resolve(here, '../schema/src/contracts-loader.ts') },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});