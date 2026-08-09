/**
 * @domio/obs-control-plane — completeness check tests.
 */

import { describe, it, expect } from 'vitest';
import { verifyCompleteness } from './completeness.js';
import { generateRoutes } from './alertmanager.js';
import { generateStatusPageComponents } from './status-page.js';
import { parseSloCatalogue } from './slo.js';
import type { SloEntry } from './types.js';

const FIXTURE = `
| Service | SLO | Target | Window | Tier | Owner | Alert |
|---|---|---|---|---|---|---|
| \`@domio/audience-service\` | avail-audience | 99.9% | 30d | tier-1 | E2 | \`SLOBurnHighAudience\` |
| \`@domio/ai-adapters\` | lat-ai-adapter-p95 | < 3 s | 30d | tier-2 | D | \`SLOBurnHighAiAdapterLat\` |
`;

function buildSlos(): SloEntry[] {
  return parseSloCatalogue(FIXTURE);
}

describe('verifyCompleteness', () => {
  it('passes when every SLO has alert, route, component, runbook', () => {
    const slos = buildSlos();
    const report = verifyCompleteness({
      slos,
      routes: generateRoutes(slos),
      components: generateStatusPageComponents(slos),
      runbookExists: () => true,
    });
    expect(report.pass).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('fails when an SLO has no status-page component', () => {
    const slos = buildSlos();
    const report = verifyCompleteness({
      slos,
      routes: generateRoutes(slos),
      components: [], // empty — no components for any service
      runbookExists: () => true,
    });
    expect(report.pass).toBe(false);
    expect(report.issues.some((i) => i.kind === 'no-component')).toBe(true);
  });

  it('fails when tier-1 runbooks are missing (tier-2 advisory)', () => {
    const slos = buildSlos();
    const report = verifyCompleteness({
      slos,
      routes: generateRoutes(slos),
      components: generateStatusPageComponents(slos),
      runbookExists: () => false,
    });
    expect(report.pass).toBe(false);
    const runbookIssues = report.issues.filter((i) => i.kind === 'no-runbook');
    // Only tier-1 SLOs surface as hard-fail issues; tier-2 are advisory.
    const tier1Count = slos.filter((s) => s.tier === 'tier-1').length;
    expect(runbookIssues).toHaveLength(tier1Count);
    expect(runbookIssues.every((i) => i.slo?.tier === 'tier-1')).toBe(true);
  });

  it('fails when no Alertmanager routes cover tier-1 pages', () => {
    const slos = buildSlos();
    const report = verifyCompleteness({
      slos,
      routes: [], // no routes
      components: generateStatusPageComponents(slos),
      runbookExists: () => true,
    });
    expect(report.pass).toBe(false);
    expect(report.issues.some((i) => i.kind === 'no-route')).toBe(true);
  });
});
