import { defineConfig } from 'vitest/config';

/**
 * Workspace-level test runner.
 *
 * Discovers Vitest specs under `tests/**` and other colocated tests under
 * `infrastructure/`, `tools/`, `threat-model/`-adjacent validators, and
 * `packages/*` that opt-in via tag. Individual packages keep their own
 * vitest configuration for `pnpm test`; this config is for cross-cutting
 * infra tests that aren't owned by a single package.
 */
export default defineConfig({
  test: {
    name: 'workspace',
    include: [
      'tests/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.mjs',
      'infrastructure/**/__tests__/**/*.{test,spec}.{ts,mjs}',
      'threat-model/__tests__/**/*.{test,spec}.{ts,mjs}',
    ],
    exclude: ['node_modules', '**/dist/**', '**/.next/**', '**/.turbo/**'],
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
    sequence: { hooks: 'list', files: 'parallel' },
  },
});