#!/usr/bin/env node
import process from 'node:process';
import { lint, formatViolations } from './lint.js';

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command !== 'lint') {
    console.error('Usage: domio-migration-lint lint [--migrations <dir>] [--strict]');
    process.exit(2);
  }
  let migrations = 'infrastructure/postgres/migrations';
  let strict = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--migrations') migrations = argv[++i] ?? migrations;
    else if (a === '--strict') strict = true;
  }
  const violations = await lint({ migrationsDir: migrations, strict });
  process.stdout.write(formatViolations(violations) + '\n');
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  if (errors > 0) process.exit(1);
  if (warnings > 0 && strict) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});