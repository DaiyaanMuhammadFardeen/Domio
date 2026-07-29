// Flat ESLint config (ESLint 9).
// Extends the recommended TypeScript + Next.js rules.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

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
];