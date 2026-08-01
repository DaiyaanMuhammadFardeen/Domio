import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Workspace-level test runner.
 *
 * This config is ONLY loaded when the `VITEST_WORKSPACE` environment
 * variable is set, which keeps `pnpm test` inside individual packages
 * from accidentally inheriting it via vitest's upward search. The
 * `test:workspace` script in the root package.json sets the var.
 */
const enabled = process.env.VITEST_WORKSPACE === '1';
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: enabled
    ? {
        alias: {
          '@domio/common': resolve(here, 'packages/common/src/index.ts'),
          '@domio/schema': resolve(here, 'packages/schema/src/index.ts'),
          '@domio/sdk': resolve(here, 'packages/sdk-ts/src/index.ts'),
        },
      }
    : undefined,
  test: enabled
    ? {
        name: 'workspace',
        include: [
          'tests/**/*.{test,spec}.ts',
          'tests/**/*.{test,spec}.mjs',
          'infrastructure/**/__tests__/**/*.{test,spec}.{ts,mjs}',
          'threat-model/__tests__/**/*.{test,spec}.{ts,mjs}',
          'slo/__tests__/**/*.{test,spec}.{ts,mjs}',
          'fixtures/__tests__/**/*.{test,spec}.{ts,mjs}',
        ],
        exclude: [
          'node_modules',
          '**/dist/**',
          '**/.next/**',
          '**/.turbo/**',
          // Files in tests/ using the `node:test` framework are picked
          // up by `scripts/mirrors/run-tests.sh` via tsx, not by
          // vitest. Mixing them causes "No test suite found" errors.
          'tests/mirrors/**',
          'tests/ci/renovate-config.spec.ts',
        ],
        environment: 'node',
        pool: 'threads',
        poolOptions: { threads: { singleThread: false } },
        reporters: ['default'],
        coverage: {
          provider: 'v8',
          reporter: ['text', 'json-summary'],
          include: [
            'tools/migration-lint/src/**',
            'tools/provenance/src/**',
            'packages/redact-pii/src/**',
          ],
          thresholds: {
            lines: 70,
            branches: 60,
            functions: 70,
            statements: 70,
            perFile: false,
          },
        },
        sequence: { hooks: 'list' },
      }
    : {
        // Per-package invocations should not be polluted by the
        // workspace include globs; we make the include empty so vitest
        // discovers nothing and exits cleanly. Per-package configs
        // override this via their own vitest.config.ts.
        include: [],
        passWithNoTests: true,
      },
});