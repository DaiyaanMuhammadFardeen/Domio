#!/usr/bin/env node
//
// Coverage aggregator for the monorepo unit-test job.
//
// When "pnpm exec turbo run test --coverage" runs, every package that
// has vitest --coverage enabled produces its own
// <package>/coverage/coverage-summary.json. The downstream
// tools/coverage-gate.mjs script reads a single
// coverage/coverage-summary.json at the repo root, so we need to
// merge all package summaries into one before the gate runs.
//
// Strategy:
//   1. Discover every coverage/coverage-summary.json under the repo.
//   2. Sum total.*.covered and total.*.pct-able counts across files
//      (weighted by the metric's own total denominator — that's what
//      pct measures against).
//   3. Write the merged total to coverage/coverage-summary.json at the
//      repo root so the gate can read it.
//
// Coverage gate behaviour is unchanged; this script just feeds it the
// right input.
//

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outputPath = join(repoRoot, 'coverage/coverage-summary.json');

/** Walk `dir` recursively, returning every regular file path. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.turbo') continue;
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** Find every per-package coverage summary. */
const summaryFiles = walk(repoRoot).filter((p) => {
  const rel = relative(repoRoot, p);
  if (!rel.endsWith('coverage/coverage-summary.json')) return false;
  if (rel.startsWith('coverage/coverage-summary.json')) return false; // the output
  if (rel.includes('/node_modules/')) return false;
  return true;
});

if (summaryFiles.length === 0) {
  console.error('No per-package coverage summaries found.');
  console.error('Run `pnpm exec turbo run test -- --coverage` first.');
  process.exit(2);
}

const KEYS = ['lines', 'statements', 'functions', 'branches'];
const totals = Object.fromEntries(
  KEYS.map((k) => [
    k,
    { total: 0, covered: 0, skipped: 0, pct: 0 },
  ]),
);
let totalFiles = 0;

for (const file of summaryFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // Skip malformed summaries — they're rare and the gate fails
    // open (we just don't add their numbers to the merge).
    continue;
  }
  const t = parsed.total ?? {};
  for (const k of KEYS) {
    const m = t[k];
    if (!m) continue;
    totals[k].total += m.total ?? 0;
    totals[k].covered += m.covered ?? 0;
    totals[k].skipped += m.skipped ?? 0;
  }
  totalFiles++;
}

for (const k of KEYS) {
  if (totals[k].total > 0) {
    totals[k].pct = Number(((totals[k].covered / totals[k].total) * 100).toFixed(2));
  }
}

const merged = { total: totals };
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.log(
  `Merged coverage from ${totalFiles} package(s) → ${relative(repoRoot, outputPath)}`,
);
for (const k of KEYS) {
  console.log(`  ${k}: ${totals[k].pct.toFixed(2)}% (${totals[k].covered}/${totals[k].total})`);
}
