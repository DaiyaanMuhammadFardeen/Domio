import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
      '@domio/api-client/gen': resolve(here, '../../packages/api-client/src/gen'),
      '@domio/api-client': resolve(here, '../../packages/api-client/src/index.ts'),
      '@domio/canvas': resolve(here, '../../packages/canvas/src/index.ts'),
      '@domio/common': resolve(here, '../../packages/common/src/index.ts'),
      '@domio/schema': resolve(here, '../../packages/schema/src/index.ts'),
      '@domio/sdk': resolve(here, '../../packages/sdk-ts/src/index.ts'),
      '@domio/yjs-shared': resolve(here, '../../packages/yjs-shared/src/index.ts'),
      '@bufbuild/protobuf': resolve(here, '../../node_modules/.pnpm/@bufbuild+protobuf@1.10.1/node_modules/@bufbuild/protobuf'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    environment: 'node',
  },
});