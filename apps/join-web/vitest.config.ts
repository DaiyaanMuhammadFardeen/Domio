import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Default is node (fast). Components need a DOM; the transport
    // fallback uses fetch + jsdom timers, so it also needs jsdom.
    environment: 'node',
    environmentOptions: {
      jsdom: {
        // Provide a host so document.cookie is writable in jsdom
        // (about:blank refuses to set cookies).
        url: 'http://localhost/',
      },
    },
    environmentMatchGlobs: [
      ['src/components/**', 'jsdom'],
      ['src/lib/**', 'node'],
      ['src/runtime/captions/**', 'jsdom'],
      ['src/runtime/transport/**', 'jsdom'],
      ['src/runtime/widgets/**', 'jsdom'],
      ['tests/**/*.test.ts', 'node'],
    ],
    setupFiles: ['./src/test-setup.ts'],
  },
});