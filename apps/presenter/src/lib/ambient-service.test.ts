/**
 * ambient-service tests — Wave 11 §S11.6.
 *
 * Covers:
 *   - getAmbientSession / getDataSnapshots / getTicker happy path
 *   - non-2xx → seed fallback
 *   - network error → seed fallback
 *   - malformed body → seed fallback
 *   - minutesUntilScheduled / isStartingNow time helpers
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_BRAND_KIT,
  getAmbientSession,
  getDataSnapshots,
  getTicker,
  isStartingNow,
  minutesUntilScheduled,
} from './ambient-service';

const ORIGINAL_DATE_NOW = Date.now;

afterEach(() => {
  Date.now = ORIGINAL_DATE_NOW;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('ambient-service', () => {
  describe('getAmbientSession', () => {
    it('returns parsed session info on 200', async () => {
      const now = Date.now();
      const fixture = {
        session_id: 's_abc',
        deck_id: 'd_xyz',
        deck_title: 'Investor Update',
        scheduled_at_ms: now + 600_000,
        agenda: [{ id: 'a1', title: 'Intro', duration_min: 3 }],
        room_name: 'Boardroom',
        presenter_name: 'Sam Patel',
        brand_kit: {
          primary_color: '#000',
          secondary_color: '#111',
          accent_color: '#222',
          background_color: '#333',
          font_family: 'Inter',
        },
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixture));
      const result = await getAmbientSession('s_abc', { fetchImpl: fetchMock });
      expect(result).toEqual(fixture);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ambient/sessions/s_abc'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('falls back to a deterministic seed on 404', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
      const result = await getAmbientSession('missing', { fetchImpl: fetchMock });
      expect(result).not.toBeNull();
      expect(result?.session_id).toBe('missing');
      expect(result?.deck_title.length).toBeGreaterThan(0);
      expect(result?.agenda.length).toBeGreaterThanOrEqual(3);
      expect(result?.brand_kit.primary_color).toBe(DEFAULT_BRAND_KIT.primary_color);
    });

    it('falls back to seed on network failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await getAmbientSession('net-fail', { fetchImpl: fetchMock });
      expect(result?.session_id).toBe('net-fail');
    });

    it('falls back to seed on malformed body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ not_a_session: true }));
      const result = await getAmbientSession('bad-body', { fetchImpl: fetchMock });
      expect(result?.session_id).toBe('bad-body');
    });
  });

  describe('getDataSnapshots', () => {
    it('returns parsed snapshots on 200', async () => {
      const fixture = {
        sources: [
          {
            id: 'd1:mrr',
            name: 'MRR',
            kind: 'currency',
            value: 12_345,
            formatted: '$12K',
            trend: 'up',
            change_pct: 2.1,
            updated_at_ms: 1_700_000_000_000,
          },
        ],
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixture));
      const result = await getDataSnapshots('d1', { fetchImpl: fetchMock });
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('d1:mrr');
      expect(result[0]?.trend).toBe('up');
    });

    it('falls back to seed on 503', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 503));
      const result = await getDataSnapshots('d_seed', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.length).toBeLessThanOrEqual(4);
      expect(result.some((s) => s.name === 'MRR')).toBe(true);
    });

    it('falls back to seed when sources array is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sources: [] }));
      const result = await getDataSnapshots('d_empty', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('filters malformed entries but keeps valid ones', async () => {
      const fixture = {
        sources: [
          { bad: true },
          {
            id: 'ok:1',
            name: 'Engagement',
            kind: 'metric',
            value: 41,
            formatted: '41%',
            trend: 'flat',
            change_pct: 0,
            updated_at_ms: 1_700_000_000_000,
          },
        ],
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixture));
      const result = await getDataSnapshots('d_mixed', { fetchImpl: fetchMock });
      // The valid entry survives, the invalid one is dropped.
      expect(result.some((s) => s.id === 'ok:1')).toBe(true);
      expect(result.some((s) => 'bad' in (s as object))).toBe(false);
    });

    it('falls back to seed on thrown network error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
      const result = await getDataSnapshots('d_net', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getTicker', () => {
    it('returns parsed ticker items on 200', async () => {
      const fixture = {
        items: [
          {
            id: 't1',
            kind: 'highlight',
            text: 'Q3 deck posted',
            timestamp_ms: 1_700_000_000_000,
          },
        ],
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(fixture));
      const result = await getTicker('d1', { fetchImpl: fetchMock });
      expect(result).toHaveLength(1);
      expect(result[0]?.kind).toBe('highlight');
    });

    it('falls back to seed on 500', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
      const result = await getTicker('d_seed', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('falls back to seed when items is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      const result = await getTicker('d_missing', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('falls back to seed on network failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
      const result = await getTicker('d_net', { fetchImpl: fetchMock });
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('time helpers', () => {
    it('minutesUntilScheduled returns ceil minutes when positive', () => {
      expect(minutesUntilScheduled(1000 + 90_000, 1000)).toBe(2);
      expect(minutesUntilScheduled(1000 + 60_000, 1000)).toBe(1);
    });

    it('minutesUntilScheduled returns 0 when scheduled is in the past', () => {
      expect(minutesUntilScheduled(1000, 5000)).toBe(0);
    });

    it('isStartingNow is true within ±30s of scheduled', () => {
      const scheduled = 1_000_000;
      expect(isStartingNow(scheduled, scheduled + 5_000)).toBe(true);
      expect(isStartingNow(scheduled, scheduled - 20_000)).toBe(true);
    });

    it('isStartingNow is false outside the window', () => {
      const scheduled = 1_000_000;
      expect(isStartingNow(scheduled, scheduled + 60_000)).toBe(false);
      expect(isStartingNow(scheduled, scheduled - 60_000)).toBe(false);
    });
  });
});
