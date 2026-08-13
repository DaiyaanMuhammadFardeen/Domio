/**
 * Rehearsal service tests — Wave 6 §S6.7.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  submitRehearsalFeedback,
  type RehearsalFeedbackRequest,
} from './rehearsal-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const SAMPLE_REQ: RehearsalFeedbackRequest = {
  session_id: 'sess-1',
  deck_id: 'deck-1',
  total_ms: 120_000,
  overall_wpm: 140,
  fillers: [
    { phrase: 'um', count: 4 },
    { phrase: 'uh', count: 2 },
  ],
  eye_contact_pct: 60,
  per_slide: [
    { slide_id: 's1', title: 'Intro', dwell_ms: 60_000, target_ms: 60_000, pace_wpm: 140, fillers: [], eye_contact_pct: 60, stumbled: false },
    { slide_id: 's2', title: 'Body', dwell_ms: 90_000, target_ms: 60_000, pace_wpm: 100, fillers: [{ phrase: 'um', count: 4 }], eye_contact_pct: 60, stumbled: true },
  ],
};

describe('rehearsal-service', () => {
  it('posts to /v1/ai/rehearsal-feedback when reachable', async () => {
    const remote = {
      id: 'fb-1',
      scores: [],
      top_fillers: [],
      stumbled_slides: [],
      pace_heatmap: [],
      recommendations: [],
      offline: false,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => remote,
    }) as unknown as typeof fetch;
    const out = await submitRehearsalFeedback(SAMPLE_REQ);
    expect(out).toEqual(remote);
  });

  it('falls back to bootstrap feedback when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await submitRehearsalFeedback(SAMPLE_REQ);
    expect(out.offline).toBe(true);
    expect(out.scores.length).toBeGreaterThanOrEqual(1);
    expect(out.top_fillers.length).toBeGreaterThan(0);
  });

  it('bootstrap marks slides with high filler density as stumbled', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await submitRehearsalFeedback(SAMPLE_REQ);
    const ids = out.stumbled_slides.map((s) => s.slide_id);
    expect(ids).toContain('s2');
  });

  it('bootstrap flags slides outside ±20% of target on the heatmap', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const out = await submitRehearsalFeedback(SAMPLE_REQ);
    const ids = out.pace_heatmap.map((h) => h.slide_id);
    expect(ids).toContain('s2'); // 90s dwell vs 60s target
  });
});