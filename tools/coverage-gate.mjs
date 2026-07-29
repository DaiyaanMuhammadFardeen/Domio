#!/usr/bin/env node
/**
 * Coverage gate enforcer for Phase 01.
 *
 * Reads `coverage/coverage-summary.json` from a Vitest `--coverage` run and
 * fails CI when any of the configured thresholds is breached. Used by the
 * `unit.yml` workflow after `pnpm test -- --coverage`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const THRESHOLDS = {
  lines: Number(process.env.COVERAGE_THRESHOLD_LINES ?? 70),
  branches: Number(process.env.COVERAGE_THRESHOLD_BRANCHES ?? 60),
  functions: Number(process.env.COVERAGE_THRESHOLD_FUNCTIONS ?? 70),
  statements: Number(process.env.COVERAGE_THRESHOLD_STATEMENTS ?? 70),
};

const summaryPath = resolve(process.cwd(), 'coverage/coverage-summary.json');
let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch (err) {
  console.error(`✗ Could not read coverage summary at ${summaryPath}`);
  console.error('  Run vitest with `--coverage` first.');
  process.exit(2);
}

const totals = summary.total ?? {};
const failures = [];
for (const [key, threshold] of Object.entries(THRESHOLDS)) {
  const value = totals[key]?.pct;
  if (typeof value !== 'number') {
    failures.push(`Missing coverage metric: ${key}`);
    continue;
  }
  if (value < threshold) {
    failures.push(`${key} ${value.toFixed(2)}% < threshold ${threshold}%`);
  } else {
    console.log(`✓ ${key} ${value.toFixed(2)}% ≥ threshold ${threshold}%`);
  }
}

if (failures.length) {
  console.error('✗ Coverage gate failed:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

console.log('Coverage gate passed.');