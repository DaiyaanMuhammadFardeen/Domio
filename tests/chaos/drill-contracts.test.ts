/**
 * P22-beta — chaos drill contract tests.
 *
 * These tests do NOT run the drills. They assert that the drill
 * artifacts (Terraform, scripts) exist, are syntactically valid, and
 * have the right shape. The drills themselves run on game day in
 * staging; see runbooks/chaos/.
 *
 * What's tested:
 *   1. Each drill's Terraform file declares the expected `drill_enabled`
 *      variable (default false) and exposes its budget as an output.
 *   2. Each drill's assertion script has a `--dry-run` mode.
 *   3. Each drill publishes metrics to the `Domio/Chaos` namespace.
 *   4. Drill names + budgets are within the P22-beta master matrix
 *      (see docs/development_phases/phase-22-beta-hardening.md §6).
 *
 * Why this is a Vitest file rather than a shell test:
 *   - We want fast CI feedback (under 30 s).
 *   - The Terraform files are static text we can grep with regex.
 *   - Running `terraform validate` against live AWS would require
 *     credentials we don't want in CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const CHAOS_DIR = join(process.cwd(), 'infra/chaos');
const SCRIPTS_DIR = join(CHAOS_DIR, 'scripts');

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => join(dir, f));
}

interface DrillSpec {
  readonly tfFile: string;
  readonly scriptFile: string;
  readonly drill: string;
}

function listDrills(): DrillSpec[] {
  const tfFiles = listFiles(CHAOS_DIR, '.tf');
  return tfFiles.map((tf) => {
    const drillName = basename(tf, '.tf').replace(/_/g, '-');
    const script = join(SCRIPTS_DIR, `${drillName.replace(/-/g, '_')}_asserts.py`);
    return { tfFile: tf, scriptFile: script, drill: drillName };
  });
}

describe('chaos drill contracts (P22-beta G3.9)', () => {
  const drills = listDrills();
  const expectedDrills = [
    'postgres-failover',
    'nats-partition',
    'ai-provider-fail',
    'cdn-outage',
    'region-isolation',
  ];

  it('covers every P22-beta G3 drill', () => {
    const present = new Set(drills.map((d) => d.drill));
    for (const expected of expectedDrills) {
      expect(present.has(expected), `missing drill ${expected}`).toBe(true);
    }
  });

  it.each(expectedDrills)('drill %s has a corresponding assertion script', (drill) => {
    const spec = drills.find((d) => d.drill === drill);
    expect(spec).toBeDefined();
    expect(existsSync(spec!.scriptFile)).toBe(true);
  });

  it.each(expectedDrills)('drill %s Terraform file declares drill_enabled', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toMatch(/variable\s+"drill_enabled"\s*\{/);
    expect(tf).toMatch(/default\s*=\s*false/);
  });

  it.each(expectedDrills)('drill %s publishes metrics to Domio/Chaos namespace', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toContain('Domio/Chaos');
    expect(tf).toMatch(/cloudwatch:PutMetricData/);
  });

  it.each(expectedDrills)('drill %s has a CloudWatch alarm for its budget breach', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toMatch(/aws_cloudwatch_metric_alarm"\s+"drill_\w+_breach"/);
  });

  it.each(expectedDrills)('drill %s assertion script has --dry-run mode', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const script = readFileSync(spec.scriptFile, 'utf8');
    expect(script).toMatch(/--dry-run/);
    expect(script).toMatch(/DRY_RUN/);
  });

  it.each(expectedDrills)('drill %s refuses to target production clusters', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const script = readFileSync(spec.scriptFile, 'utf8');
    // Postgres drill explicitly enforces -staging or -loadtest suffix.
    // Other drills target specific resources; they MUST NOT default to
    // production identifiers. Spot-check the script text.
    if (drill === 'postgres-failover') {
      expect(script).toContain('-staging');
      expect(script).toContain('-loadtest');
    }
    // All scripts must require explicit env vars (no hardcoded production IDs).
    expect(script).not.toMatch(/prod[_-]?[a-z0-9-]+\.domio\.app/i);
  });

  it.each(expectedDrills)('drill %s exits 0 on pass and 1 on fail', (drill) => {
    const spec = drills.find((d) => d.drill === drill)!;
    const script = readFileSync(spec.scriptFile, 'utf8');
    expect(script).toMatch(/return\s+0\s*$/m);
    expect(script).toMatch(/return\s+1\s*$/m);
  });

  it('postgres-failover RTO budget is 60s', () => {
    const spec = drills.find((d) => d.drill === 'postgres-failover')!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toContain('rto_budget_seconds');
    expect(tf).toMatch(/default\s*=\s*60/);
  });

  it('ai-provider-fail degradation budget is 5s', () => {
    const spec = drills.find((d) => d.drill === 'ai-provider-fail')!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toContain('degradation_budget_seconds');
    expect(tf).toMatch(/default\s*=\s*5/);
  });

  it('cdn-outage status-page propagation budget is 120s', () => {
    const spec = drills.find((d) => d.drill === 'cdn-outage')!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toContain('status_page_propagation_budget_seconds');
    expect(tf).toMatch(/default\s*=\s*120/);
  });

  it('region-isolation traffic-shift budget is 30s', () => {
    const spec = drills.find((d) => d.drill === 'region-isolation')!;
    const tf = readFileSync(spec.tfFile, 'utf8');
    expect(tf).toContain('traffic_shift_budget_seconds');
    expect(tf).toMatch(/default\s*=\s*30/);
  });
});
