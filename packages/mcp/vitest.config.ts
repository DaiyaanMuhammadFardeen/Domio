import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domio/agent-schema': resolve(here, '../agent-schema/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});