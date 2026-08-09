#!/usr/bin/env node
/**
 * Phase 22-beta — public-beta release gate verifier.
 *
 * Aggregates the four P22 DoD streams (G1 perf, G2 reliability, G3
 * load, G5 a11y/i18n) and the workflow-presence check into one
 * summary. Failing this exits non-zero.
 *
 * Used by `.github/workflows/public-beta-gate.yml`. Run locally:
 *
 *   pnpm --filter @domio/obs-control-plane build
 *   node services/obs-control-plane/scripts/verify-beta.mjs
 *
 * Exit code: 0 when all checks pass, 1 otherwise.
 */
import { parseSloCatalogue } from '../dist/slo.js';
import { checkTracingCoverage } from '../dist/tracing_coverage.js';
import { verifyCompleteness } from '../dist/completeness.js';
import { generateRoutes } from '../dist/alertmanager.js';
import { generateStatusPageComponents } from '../dist/status-page.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const cataloguePath = join(repoRoot, 'docs', 'slos', 'catalogue.md');

const checks = [];
const passFail = (label, ok, detail = '') => {
  checks.push({ label, ok, detail });
};

const md = readFileSync(cataloguePath, 'utf8');
const slos = parseSloCatalogue(md);

// G1 — Performance & Scale
passFail('G1.1 canvas_fps.spec.ts exists', existsSync(join(repoRoot, 'apps/editor/perf/canvas_fps.spec.ts')));
passFail('G1.2 perf-nightly.yml scheduled', existsSync(join(repoRoot, '.github/workflows/perf-nightly.yml')));

// G2 — Reliability & Observability
const traceReport = checkTracingCoverage(repoRoot, slos);
passFail('G2.1 tracing coverage passes', traceReport.pass, `${traceReport.issues.length} issues, ${traceReport.warn.length} warns`);

const runbookExists = (slo) => {
  const short = slo.service.replace(/^@domio\//, '').replace(/-service$/, '');
  const paths = [
    join(repoRoot, 'docs/runbooks', short, `${slo.kind}.md`),
    join(repoRoot, 'docs/runbooks', short, `${slo.slo}.md`),
    join(repoRoot, 'docs/runbooks', short, 'README.md'),
  ];
  return paths.some((p) => existsSync(p));
};
const routes = generateRoutes(slos);
const components = generateStatusPageComponents(slos);
const completeReport = verifyCompleteness({ slos, routes, components, runbookExists });
passFail('G2.2 SLO completeness', completeReport.pass, `${completeReport.issues.length} issues`);

// G3 — Load
passFail('G3.1 p22-load.yml exists', existsSync(join(repoRoot, '.github/workflows/p22-load.yml')));
passFail(
  'G3.2 5 k6 scenarios present',
  ['audience_50k.js', 'editors_10k.js', 'presenter_2h.js', 'decks_100k.js', 'ingest_timeline.js'].every((s) =>
    existsSync(join(repoRoot, 'infra/loadtest', s)),
  ),
);

// G5 — Accessibility & i18n
passFail('G5.1 axe config exists', existsSync(join(repoRoot, '.axe/config.json')));
passFail('G5.2 a11y-i18n.yml exists', existsSync(join(repoRoot, '.github/workflows/a11y-i18n.yml')));
passFail('G5.3 @domio/i18n exports ar/ur', existsSync(join(repoRoot, 'packages/i18n/src/locales.ts')));

const i18nSrc = readFileSync(join(repoRoot, 'packages/i18n/src/locales.ts'), 'utf8');
passFail(
  'G5.4 RTL_LOCALES exports ar + ur',
  /RTL_LOCALES/.test(i18nSrc) && /['"]ar['"]/.test(i18nSrc) && /['"]ur['"]/.test(i18nSrc),
);

const editorLayout = readFileSync(join(repoRoot, 'apps/editor/src/app/layout.tsx'), 'utf8');
passFail('G5.5 editor sets html lang + dir from cookie', /toHtmlLang|toHtmlDir/.test(editorLayout));

const dashboardLayout = readFileSync(join(repoRoot, 'apps/dashboard/src/app/layout.tsx'), 'utf8');
passFail('G5.6 dashboard sets html lang + dir from cookie', /toHtmlLang|toHtmlDir/.test(dashboardLayout));

// G4 — Gate
passFail('G4.1 deploy.yml exists', existsSync(join(repoRoot, '.github/workflows/deploy.yml')));
passFail('G4.2 release-readiness.md exists', existsSync(join(repoRoot, 'docs/runbooks/release-readiness.md')));
passFail('G4.3 tracing-coverage.yml exists', existsSync(join(repoRoot, '.github/workflows/tracing-coverage.yml')));
passFail('G4.4 editor-e2e.yml exists', existsSync(join(repoRoot, '.github/workflows/editor-e2e.yml')));

// Workflow presence matrix
const requiredWorkflows = [
  'ci.yml',
  'unit.yml',
  'lint.yml',
  'type.yml',
  'editor-e2e.yml',
  'dashboard-build.yml',
  'tracing-coverage.yml',
  'a11y-i18n.yml',
  'schema-validate.yml',
  'schema-migration-lint.yml',
  'contract.yml',
  'smoke.yml',
  'security.yml',
  'leak-scan.yml',
  'threat-model-diff.yml',
  'build-provenance.yml',
  'release.yml',
  'publish.yml',
  'phase17-services-build.yml',
  'deploy.yml',
  'load.yml',
  'p22-load.yml',
  'perf-nightly.yml',
  'public-beta-gate.yml',
];
for (const wf of requiredWorkflows) {
  passFail(`workflow ${wf} present`, existsSync(join(repoRoot, '.github/workflows', wf)));
}

// Summary
console.log('\nPhase 22-beta Public-Beta Gate Verification');
console.log('=============================================\n');
let pass = 0,
  fail = 0;
for (const c of checks) {
  const mark = c.ok ? '✓' : '✗';
  console.log(`${mark} ${c.label.padEnd(60)} ${c.detail}`);
  if (c.ok) pass++;
  else fail++;
}
console.log(`\nPASS: ${pass} / ${checks.length}`);
console.log(`FAIL: ${fail}`);
console.log(fail === 0 ? '\nPUBLIC-BETA GATE: GREEN\n' : '\nPUBLIC-BETA GATE: RED\n');
process.exit(fail === 0 ? 0 : 1);
