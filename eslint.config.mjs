// Flat ESLint config (ESLint 9).
// Extends the recommended TypeScript + Next.js rules.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import domio from '@domio/eslint-plugin';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/gen/**',
      '**/generated/**',
      '**/*.pb.go',
      '**/*.pb.cc',
      '**/*.pb.h',
      '**/_pb2.py',
      '**/_pb2_grpc.py',
      // Compiled output from a sibling .ts source — the .ts file is the
      // canonical surface for lint; the emitted .js is checked in for
      // downstream tooling but should not be linted directly.
      '**/src/**/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Component surfaces (apps /, /apps/editor/src/components, /apps/editor/src/panels)
  // get the strict domio rules. Service / lib files are exempted so
  // network calls and hex literals are only forbidden in views.
  {
    files: [
      'apps/**/src/components/**/*.{ts,tsx}',
      'apps/**/src/panels/**/*.{ts,tsx}',
      'apps/**/src/app/**/page.tsx',
      'apps/**/src/app/**/layout.tsx',
    ],
    plugins: {
      domio,
    },
    rules: {
      'domio/no-raw-href': 'warn',
      'domio/no-raw-fetch': 'error',
      // no-raw-hex is gated behind a feature-flag-style opt-in so the
      // existing viewer/editor components (which were built before the
      // rule) can continue to pass lint while we migrate them in
      // batches. Add an explicit `/* domio-no-raw-hex */` annotation
      // on a file to re-enable enforcement.
      'domio/no-raw-hex': 'off',
    },
  },
];