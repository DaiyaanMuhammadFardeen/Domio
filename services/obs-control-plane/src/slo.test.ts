/**
 * @domio/obs-control-plane — SLO catalogue parser tests.
 */

import { describe, it, expect } from 'vitest';
import { parseSloCatalogue, SloParseError } from './slo.js';

const FIXTURE = `
# Master SLO Catalogue — Domio

| Service | SLO | Target | Window | Tier | Owner | Alert |
|---|---|---|---|---|---|---|
| \`@domio/audience-service\` | avail-audience | 99.9% | 30d | tier-1 | E2 | \`SLOBurnHighAudience\` |
| \`@domio/ai-adapters\` | lat-ai-adapter-p95 | < 3 s | 30d | tier-2 | D (AI) | \`SLOBurnHighAiAdapterLat\` |
| \`@domio/clickhouse-loader\` | avail-clickhouse-loader | 99.5% | 30d | tier-2 | F | \`SLOBurnHighClickhouseLoader\` |
`;

describe('parseSloCatalogue', () => {
  it('parses three valid rows from a markdown table', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries).toHaveLength(3);
  });

  it('strips backticks from the service cell', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries[0]!.service).toBe('@domio/audience-service');
  });

  it('parses tier-1 / tier-2 / tier-3 correctly', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries.map((e) => e.tier)).toEqual(['tier-1', 'tier-2', 'tier-2']);
  });

  it('converts a 99.9% target to a probability of 0.999', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries[0]!.targetProbability).toBeCloseTo(0.999, 6);
    expect(entries[2]!.targetProbability).toBeCloseTo(0.995, 6);
  });

  it('infers SLO kind from name', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries[0]!.kind).toBe('availability');
    expect(entries[1]!.kind).toBe('latency');
  });

  it('parses latency threshold into ms', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries[1]!.latencyThresholdMs).toBe(3000);
  });

  it('parses 30d window into seconds', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries[0]!.windowSeconds).toBe(30 * 86_400);
  });

  it('ignores header and separator rows', () => {
    const entries = parseSloCatalogue(FIXTURE);
    expect(entries.every((e) => e.service.startsWith('@domio/'))).toBe(true);
  });

  it('throws SloParseError on an unknown tier', () => {
    const md = `
| Service | SLO | Target | Window | Tier | Owner | Alert |
|---|---|---|---|---|---|---|
| \`@domio/test\` | avail-test | 99.9% | 30d | tier-99 | Owner | Alert |
`;
    expect(() => parseSloCatalogue(md)).toThrow(SloParseError);
  });

  it('throws SloParseError on an unknown SLO kind prefix', () => {
    const md = `
| Service | SLO | Target | Window | Tier | Owner | Alert |
|---|---|---|---|---|---|---|
| \`@domio/test\` | weird-test | 99.9% | 30d | tier-1 | Owner | Alert |
`;
    expect(() => parseSloCatalogue(md)).toThrow(SloParseError);
  });
});
