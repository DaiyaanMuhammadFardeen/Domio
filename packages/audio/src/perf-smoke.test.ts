/**
 * @domio/audio — Phase 11 perf smoke.
 *
 * Validates that the audio mixer + envelopes meet the Phase 11 budget:
 *  - 64-track GainBusState computeAllGains under 1 ms (R-11-2)
 *
 * Generous 10x wall-clock headroom so CI doesn't flake.
 */

import { describe, it, expect } from 'vitest';
import { computeAllGains, type GainBusState, type TrackConfig } from './mixer.js';

function makeState(trackCount: number): GainBusState {
  const tracks: TrackConfig[] = [];
  for (let i = 0; i < trackCount; i++) {
    tracks.push({
      id: `t-${i}`,
      kind: i % 2 === 0 ? 'music' : 'voiceover',
      volume: (i % 5) * 0.2,
      pan: (i % 3) * 0.5 - 0.5,
      mute: false,
      durationMs: 30_000,
    });
  }
  return { globalVolume: 1, masterVolume: 0.9, tracks };
}

describe('perf smoke — audio mixer (R-11-2)', () => {
  it('computes all gains for a 64-track bus under the budget', () => {
    const state = makeState(64);
    const t0 = performance.now();
    const result = computeAllGains(state);
    const elapsed = performance.now() - t0;

    expect(result.size).toBe(64);
    expect(elapsed).toBeLessThan(10);
  });

  it('handles 256 tracks without exceeding 10x budget', () => {
    const state = makeState(256);
    const t0 = performance.now();
    const result = computeAllGains(state);
    const elapsed = performance.now() - t0;

    expect(result.size).toBe(256);
    expect(elapsed).toBeLessThan(50);
  });
});