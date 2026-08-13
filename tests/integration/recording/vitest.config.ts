import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domio/object-store': resolve(here, '../../../packages/object-store/src/index.ts'),
      '@domio/audit-ts': resolve(here, '../../../packages/audit-ts/src/index.ts'),
      '@domio/recording-orchestrator': resolve(
        here,
        '../../../services/recording-orchestrator/src/index.ts',
      ),
      '@domio/recording-extensions': resolve(
        here,
        '../../../packages/recording-extensions/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
