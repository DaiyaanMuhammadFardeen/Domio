import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const eventIngestSrc = resolve(here, '../../../services/event-ingest/src');
const analyticsWarehouseSrc = resolve(here, '../../../services/analytics-warehouse/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@domio\/event-ingest\/types$/, replacement: `${eventIngestSrc}/types.ts` },
      { find: /^@domio\/event-ingest\/kafka$/, replacement: `${eventIngestSrc}/kafka.ts` },
      { find: /^@domio\/analytics-warehouse$/, replacement: `${analyticsWarehouseSrc}/index.ts` },
      { find: /^@domio\/event-ingest$/, replacement: `${eventIngestSrc}/index.ts` },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
