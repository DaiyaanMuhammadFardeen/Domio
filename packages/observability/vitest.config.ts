import { defineConfig } from 'vitest/config';

/**
 * Package-local Vitest config. Overrides the workspace root's
 * `vitest.config.ts` so this package's tests are isolated from the
 * workspace-wide `tests/` glob.
 */
export default defineConfig({
  test: {
    name: 'observability',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.turbo', 'coverage'],
    environment: 'node',
    reporters: ['default'],
    testTimeout: 10_000,
  },
});
