/**
 * Tests for provenance-service.ts — types, fresh/stale/outdated
 * badges, fallback on failure, refresh bumps freshness.
 *
 * Per Wave 11 §S11.11 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 */

import { describe, it, expect } from 'vitest';
import {
  AGENT_PROVENANCE_BASE,
  FRESHNESS_COLOR,
  FRESHNESS_KEY,
  SEED_PROVENANCE,
  findSeed,
  formatRelative,
  getProvenance,
  listProvenance,
  listSeed,
  refreshProvenance,
} from './provenance-service';

describe('provenance-service types', () => {
  it('exposes the expected freshness keys', () => {
    expect(FRESHNESS_KEY.fresh).toBe('editor.provenance.drawer.freshness.fresh');
    expect(FRESHNESS_KEY.stale).toBe('editor.provenance.drawer.freshness.stale');
    expect(FRESHNESS_KEY.outdated).toBe('editor.provenance.drawer.freshness.outdated');
  });

  it('exposes a colour token for every freshness status', () => {
    expect(FRESHNESS_COLOR.fresh).toMatch(/emerald/);
    expect(FRESHNESS_COLOR.stale).toMatch(/amber/);
    expect(FRESHNESS_COLOR.outdated).toMatch(/rose/);
  });

  it('exports the ai-orchestrator agent endpoint base', () => {
    expect(AGENT_PROVENANCE_BASE).toBe('services/ai-orchestrator/get_provenance');
  });
});

describe('findSeed', () => {
  it('returns the seed record for a known element_id', () => {
    const seed = findSeed('el-stat-mrr');
    expect(seed).not.toBeNull();
    expect(seed?.source_system).toBe('Stripe');
    expect(seed?.freshness).toBe('fresh');
  });

  it('returns null for an unknown element_id', () => {
    expect(findSeed('el-does-not-exist')).toBeNull();
  });

  it('exposes 5-8 seed records', () => {
    expect(SEED_PROVENANCE.length).toBeGreaterThanOrEqual(5);
    expect(SEED_PROVENANCE.length).toBeLessThanOrEqual(8);
  });

  it('every seed record carries a populated agent endpoint', () => {
    for (const p of SEED_PROVENANCE) {
      expect(p.agent_endpoint).toContain(AGENT_PROVENANCE_BASE);
      expect(p.agent_endpoint).toContain(`id=${p.id}`);
    }
  });

  it('seeds include all three freshness categories', () => {
    const statuses = new Set(SEED_PROVENANCE.map((p) => p.freshness));
    expect(statuses.has('fresh')).toBe(true);
    expect(statuses.has('stale')).toBe(true);
    expect(statuses.has('outdated')).toBe(true);
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000_000;

  it('reports sub-minute deltas as "just now"', () => {
    expect(formatRelative(now - 5_000, now)).toBe('just now');
  });

  it('reports minute deltas', () => {
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 min ago');
  });

  it('reports hour deltas', () => {
    expect(formatRelative(now - 3 * 60 * 60_000, now)).toBe('3 h ago');
  });

  it('reports day deltas', () => {
    expect(formatRelative(now - 2 * 24 * 60 * 60_000, now)).toBe('2 d ago');
  });

  it('clamps future timestamps to "just now"', () => {
    expect(formatRelative(now + 5_000, now)).toBe('just now');
  });
});

describe('getProvenance', () => {
  it('returns a cloned record for a known element', async () => {
    const out = await getProvenance('el-stat-mrr');
    expect(out).not.toBeNull();
    expect(out?.element_id).toBe('el-stat-mrr');
    expect(out?.agent_endpoint).toContain('id=prv-001');
  });

  it('returns null for an unknown element', async () => {
    expect(await getProvenance('el-nope')).toBeNull();
  });

  it('never throws', async () => {
    await expect(getProvenance('')).resolves.toBeNull();
    await expect(getProvenance('not-in-seed')).resolves.toBeNull();
  });
});

describe('refreshProvenance', () => {
  it('bumps last_verified_at_ms to ~now and sets freshness=fresh', async () => {
    const before = Date.now();
    const out = await refreshProvenance('el-stat-churn');
    const after = Date.now();
    expect(out.freshness).toBe('fresh');
    expect(out.last_verified_at_ms).toBeGreaterThanOrEqual(before);
    expect(out.last_verified_at_ms).toBeLessThanOrEqual(after);
  });

  it('preserves source_system and owner after refresh', async () => {
    const out = await refreshProvenance('el-chart-active-users');
    expect(out.source_system).toBe('Internal DB');
    expect(out.owner).toBe('data-platform@growthco.com');
  });

  it('synthesises a placeholder record for unknown elements', async () => {
    const out = await refreshProvenance('el-unknown-xyz');
    expect(out.element_id).toBe('el-unknown-xyz');
    expect(out.source_system).toBe('Unknown');
    expect(out.freshness).toBe('fresh');
    expect(out.agent_endpoint).toContain(AGENT_PROVENANCE_BASE);
  });
});

describe('listProvenance', () => {
  it('returns a non-empty array for any deck id', async () => {
    const items = await listProvenance('deck-001');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.agent_endpoint).toContain(AGENT_PROVENANCE_BASE);
    }
  });

  it('is deterministic for the same deck id', async () => {
    const a = await listProvenance('deck-42');
    const b = await listProvenance('deck-42');
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });

  it('produces a rotation for different deck ids', () => {
    // SEED has 8 records; offset = lastDigit % 8.
    // deck-2 → offset 2; deck-4 → offset 4 (genuinely different).
    const c = listSeed('deck-2');
    const d = listSeed('deck-4');
    expect(c[0]?.id).not.toBe(d[0]?.id);
    // Sanity: the seed has 8 records, so each rotation has at least one entry.
    expect(c.length).toBeGreaterThan(0);
    expect(d.length).toBeGreaterThan(0);
  });

  it('never throws on bad input', async () => {
    await expect(listProvenance('')).resolves.toBeDefined();
  });
});
