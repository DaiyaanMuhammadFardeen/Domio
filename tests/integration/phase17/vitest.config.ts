import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domio/analytics-warehouse': resolve(here, '../../../services/analytics-warehouse/src/index.ts'),
      '@domio/event-ingest': resolve(here, '../../../services/event-ingest/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
