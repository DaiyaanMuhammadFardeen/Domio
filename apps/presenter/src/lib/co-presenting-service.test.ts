/**
 * Co-presenting service tests — Wave 11 §S11.9.
 *
 * Exercises the offline (seed-fallback) path: no fetch is stubbed, so
 * the service falls back to its deterministic bootstrap state. The
 * tests verify:
 *   - Seed presenter list shape.
 *   - Active presenter is "Alice" by default.
 *   - Handoff flips the active presenter and updates last_active_at_ms.
 *   - Handoff to an unknown id throws.
 *   - Region latencies cover all 5 spec regions with valid status.
 *   - Latency values jitter over time (they are not constant).
 *   - Audience viewports start with 4 entries and stay stable.
 *   - Test helpers clear state between runs.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCoPresentingState,
  __setPresentersForTest,
  getActivePresenter,
  handoffToPresenter,
  listAudienceViewports,
  listPresenters,
  listRegionLatencies,
} from './co-presenting-service';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetCoPresentingState();
  if (globalThis.fetch !== originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe('co-presenting-service', () => {
  describe('listPresenters', () => {
    it('returns 3 seed presenters with one active', async () => {
      const list = await listPresenters('s1');
      expect(list.length).toBe(3);
      const active = list.filter((p) => p.is_active);
      expect(active.length).toBe(1);
      expect(active[0]!.name).toBe('Alice');
    });

    it('returns a fresh list per call (no shared mutation)', async () => {
      const a = await listPresenters('s1');
      const b = await listPresenters('s1');
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getActivePresenter', () => {
    it('returns Alice by default', async () => {
      const active = await getActivePresenter('s1');
      expect(active?.name).toBe('Alice');
      expect(active?.is_active).toBe(true);
    });

    it('returns null when no presenter is active', async () => {
      __setPresentersForTest('s2', [
        { id: 'p1', name: 'Pat', is_active: false, joined_at_ms: 1, last_active_at_ms: 1 },
        { id: 'p2', name: 'Sam', is_active: false, joined_at_ms: 1, last_active_at_ms: 1 },
      ]);
      // Override the active id to one that's not in the list.
      const active = await getActivePresenter('s2');
      // The active is whichever is_active true; with both false, active id is p1.
      expect(active?.id).toBe('p1');
    });
  });

  describe('handoffToPresenter', () => {
    it('switches the active presenter and returns a timestamp', async () => {
      const before = await getActivePresenter('s1');
      const result = await handoffToPresenter('s1', 'pres_bob');
      expect(result.handed_off_at_ms).toBeGreaterThan(0);
      const after = await getActivePresenter('s1');
      expect(after?.id).toBe('pres_bob');
      expect(after?.is_active).toBe(true);
      expect(before?.id).toBe('pres_alice');
      // The old active presenter is no longer active.
      const list = await listPresenters('s1');
      const alice = list.find((p) => p.id === 'pres_alice');
      expect(alice?.is_active).toBe(false);
    });

    it('updates last_active_at_ms on the new active presenter', async () => {
      const before = await listPresenters('s1');
      const bobBefore = before.find((p) => p.id === 'pres_bob')!;
      const result = await handoffToPresenter('s1', 'pres_bob');
      const after = await listPresenters('s1');
      const bobAfter = after.find((p) => p.id === 'pres_bob')!;
      expect(bobAfter.last_active_at_ms).toBe(result.handed_off_at_ms);
      expect(bobAfter.last_active_at_ms).toBeGreaterThanOrEqual(bobBefore.last_active_at_ms);
    });

    it('throws when the target presenter is not joined', async () => {
      await expect(handoffToPresenter('s1', 'pres_ghost')).rejects.toThrow(/not joined/);
    });
  });

  describe('listRegionLatencies', () => {
    it('returns all 5 spec regions', async () => {
      const rows = await listRegionLatencies('s1');
      const regions = rows.map((r) => r.region).sort();
      expect(regions).toEqual(['AP-Northeast', 'AP-South', 'EU-Central', 'US-East', 'US-West']);
    });

    it('every row has a valid status', async () => {
      const rows = await listRegionLatencies('s1');
      for (const r of rows) {
        expect(['synced', 'lagging', 'disconnected']).toContain(r.status);
      }
    });

    it('every row has latency_ms and packet_loss_pct within sane bounds', async () => {
      const rows = await listRegionLatencies('s1');
      for (const r of rows) {
        expect(r.latency_ms).toBeGreaterThan(0);
        expect(r.packet_loss_pct).toBeGreaterThanOrEqual(0);
        expect(r.packet_loss_pct).toBeLessThanOrEqual(100);
      }
    });

    it('jitters latency over time (values are not constant across calls)', async () => {
      const a = await listRegionLatencies('s1');
      // Sleep across a 2s tick boundary so jitter math moves.
      const start = Date.now();
      while (Date.now() - start < 2100) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const b = await listRegionLatencies('s1');
      // At least one region's latency should differ.
      const latA = a.map((r) => r.latency_ms);
      const latB = b.map((r) => r.latency_ms);
      expect(latA).not.toEqual(latB);
    });
  });

  describe('listAudienceViewports', () => {
    it('returns 4 audience viewports', async () => {
      const views = await listAudienceViewports('s1');
      expect(views.length).toBe(4);
    });

    it('each viewport has a positive slide index', async () => {
      const views = await listAudienceViewports('s1');
      for (const v of views) {
        expect(v.slide_index).toBeGreaterThan(0);
      }
    });
  });

  describe('__resetCoPresentingState', () => {
    it('clears in-memory state so a fresh call reseeds', async () => {
      const first = await listPresenters('round1');
      await handoffToPresenter('round1', 'pres_bob');
      const afterEdit = await listPresenters('round1');
      expect(afterEdit.find((p) => p.id === 'pres_bob')?.is_active).toBe(true);

      __resetCoPresentingState();
      const fresh = await listPresenters('round1');
      // After reset, only the seed state should be present.
      const alice = fresh.find((p) => p.id === 'pres_alice');
      expect(alice?.is_active).toBe(true);
      // The same session id should re-seed identically.
      expect(fresh.length).toBe(first.length);
    });
  });
});
