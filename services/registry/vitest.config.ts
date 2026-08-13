import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@domio/schema-prop': fileURLToPath(
        new URL('./../../packages/schema-prop/src/index.ts', import.meta.url),
      ),
      '@domio/schema': fileURLToPath(
        new URL('./../../packages/schema/src/index.ts', import.meta.url),
      ),
      '@domio/components': fileURLToPath(
        new URL('./../../packages/components/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/server.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
