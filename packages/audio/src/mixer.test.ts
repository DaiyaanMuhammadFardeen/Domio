import { describe, expect, it } from 'vitest';
import {
  computeTrackGain,
  computeTrackPan,
  computeAllGains,
  type GainBusState,
} from './mixer.js';

function makeState(overrides: Partial<GainBusState> = {}): GainBusState {
  return {
    globalVolume: 1.0,
    masterVolume: 1.0,
    tracks: [
      { id: 'vo', kind: 'voiceover', volume: 0.8, pan: 0, mute: false, durationMs: 5000 },
      { id: 'music', kind: 'music', volume: 0.6, pan: 0.3, mute: false, durationMs: 10000 },
      { id: 'ambient', kind: 'ambient', volume: 0.4, pan: -0.5, mute: true, durationMs: 30000 },
    ],
    ...overrides,
  };
}

describe('computeTrackGain', () => {
  it('multiplies global × master × track volume linearly', () => {
    const state = makeState({ globalVolume: 0.5, masterVolume: 0.8 });
    // vo: 0.5 * 0.8 * 0.8 = 0.32
    expect(computeTrackGain(state, 'vo')).toBeCloseTo(0.32, 10);
  });

  it('muted track returns 0', () => {
    const state = makeState();
    // ambient is muted
    expect(computeTrackGain(state, 'ambient')).toBe(0);
  });

  it('mute zeroes regardless of volume', () => {
    const state = makeState({
      tracks: [{ id: 'x', kind: 'sfx', volume: 1.0, pan: 0, mute: true, durationMs: 1000 }],
    });
    expect(computeTrackGain(state, 'x')).toBe(0);
  });

  it('master scales all tracks', () => {
    const state = makeState({ masterVolume: 0.5 });
    // vo: 1.0 * 0.5 * 0.8 = 0.4
    expect(computeTrackGain(state, 'vo')).toBeCloseTo(0.4, 10);
    // music: 1.0 * 0.5 * 0.6 = 0.3
    expect(computeTrackGain(state, 'music')).toBeCloseTo(0.3, 10);
  });

  it('global volume scales all tracks', () => {
    const state = makeState({ globalVolume: 0.25 });
    // vo: 0.25 * 1.0 * 0.8 = 0.2
    expect(computeTrackGain(state, 'vo')).toBeCloseTo(0.2, 10);
  });

  it('returns 0 for unknown track id', () => {
    const state = makeState();
    expect(computeTrackGain(state, 'nonexistent')).toBe(0);
  });

  it('clamps gain to [0, 1] when volumes exceed 1', () => {
    const state = makeState({
      globalVolume: 1.5,
      masterVolume: 1.5,
      tracks: [{ id: 'x', kind: 'sfx', volume: 1.5, pan: 0, mute: false, durationMs: 1000 }],
    });
    expect(computeTrackGain(state, 'x')).toBe(1);
  });

  it('clamps negative volumes to 0', () => {
    const state = makeState({
      globalVolume: -0.5,
      tracks: [{ id: 'x', kind: 'sfx', volume: -1, pan: 0, mute: false, durationMs: 1000 }],
    });
    expect(computeTrackGain(state, 'x')).toBe(0);
  });
});

describe('computeTrackPan', () => {
  it('returns the track pan value', () => {
    const state = makeState();
    expect(computeTrackPan(state, 'music')).toBe(0.3);
  });

  it('clamps pan to [-1, 1]', () => {
    const state = makeState({
      tracks: [{ id: 'x', kind: 'sfx', volume: 1, pan: 2.5, mute: false, durationMs: 1000 }],
    });
    expect(computeTrackPan(state, 'x')).toBe(1);
  });

  it('clamps negative pan', () => {
    const state = makeState({
      tracks: [{ id: 'x', kind: 'sfx', volume: 1, pan: -3, mute: false, durationMs: 1000 }],
    });
    expect(computeTrackPan(state, 'x')).toBe(-1);
  });

  it('returns 0 for unknown track id', () => {
    const state = makeState();
    expect(computeTrackPan(state, 'unknown')).toBe(0);
  });
});

describe('computeAllGains', () => {
  it('returns gains for all tracks', () => {
    const state = makeState();
    const gains = computeAllGains(state);
    expect(gains.size).toBe(3);
    expect(gains.get('vo')).toBeCloseTo(0.8, 10);
    expect(gains.get('music')).toBeCloseTo(0.6, 10);
    expect(gains.get('ambient')).toBe(0); // muted
  });

  it('applies global volume to all', () => {
    const state = makeState({ globalVolume: 0.5 });
    const gains = computeAllGains(state);
    expect(gains.get('vo')).toBeCloseTo(0.4, 10);
    expect(gains.get('music')).toBeCloseTo(0.3, 10);
  });
});
