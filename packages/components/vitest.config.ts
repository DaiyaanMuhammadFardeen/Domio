import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@domio/schema': fileURLToPath(new URL('../schema/src/index.ts', import.meta.url)),
      '@domio/schema-prop': fileURLToPath(new URL('../schema-prop/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
