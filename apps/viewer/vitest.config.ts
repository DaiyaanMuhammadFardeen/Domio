import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domio/animation-runtime': resolve(here, '../../packages/animation-runtime/src/index.ts'),
      '@domio/ar-sessions': resolve(here, '../../services/ar-sessions/src/index.ts'),
      '@domio/easing': resolve(here, '../../packages/easing/src/index.ts'),
      '@domio/audio': resolve(here, '../../packages/audio/src/index.ts'),
      '@domio/video': resolve(here, '../../packages/video/src/index.ts'),
      '@domio/physics': resolve(here, '../../packages/physics/src/index.ts'),
      '@domio/embed-proxy': resolve(here, '../../services/embed-proxy/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Required by jsdom 25 to enable localStorage. Default is
        // `about:blank`, an opaque origin that disables storage APIs.
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
});
