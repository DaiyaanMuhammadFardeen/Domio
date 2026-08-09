#!/usr/bin/env node
/**
 * Phase 22-beta — tracing coverage CLI.
 *
 * Runs `checkTracingCoverage()` against the monorepo root and the
 * SLO catalogue, prints a human-readable summary, and exits with a
 * non-zero code when any tier-1 issue is found.
 *
 * Used by `.github/workflows/tracing-coverage.yml` and from local
 * pre-commit hooks. Wired via:
 *
 *   pnpm --filter @domio/obs-control-plane exec tsx scripts/tracing-coverage.mjs
 *   # or after build:
 *   node services/obs-control-plane/scripts/tracing-coverage.mjs
 *
 * Exits 0 if `pass === true`, 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSloCatalogue } from '../dist/slo.js';
import { checkTracingCoverage } from '../dist/tracing_coverage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const cataloguePath = join(repoRoot, 'docs', 'slos', 'catalogue.md');

const md = readFileSync(cataloguePath, 'utf8');
const slos = parseSloCatalogue(md);
const report = checkTracingCoverage(repoRoot, slos);

console.log(`Phase 22-beta tracing-coverage`);
console.log(`Catalogue: ${cataloguePath}`);
console.log(`Services scanned: ${report.services}`);
console.log(`Pass: ${report.pass}`);
console.log(`Issues: ${report.issues.length}`);
console.log(`Warns: ${report.warn.length}`);
console.log('');

if (report.issues.length > 0) {
  console.log('--- ISSUES (failing) ---');
  for (const i of report.issues) {
    console.log(`  ${i.service.padEnd(40)} ${i.kind.padEnd(28)} ${i.detail}`);
  }
}
if (report.warn.length > 0) {
  console.log('');
  console.log('--- WARNS (advisory) ---');
  for (const w of report.warn) {
    console.log(`  ${w.service.padEnd(40)} ${w.kind.padEnd(28)} ${w.detail}`);
  }
}

process.exit(report.pass ? 0 : 1);
