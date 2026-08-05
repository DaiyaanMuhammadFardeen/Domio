import { describe, expect, it } from 'vitest';
import {
  fadeGain,
  duckGain,
  backgroundGain,
  type FadeConfig,
  type DuckingConfig,
} from './envelopes.js';

// ─── fadeGain ───────────────────────────────────────────────────────────────

describe('fadeGain', () => {
  const config: FadeConfig = {
    fadeInMs: 1000,
    fadeOutMs: 500,
    durationMs: 5000,
  };

  it('returns 0 before playhead reaches 0', () => {
    expect(fadeGain(-100, config)).toBe(0);
  });

  it('returns 0 at durationMs', () => {
    expect(fadeGain(5000, config)).toBe(0);
  });

  it('returns 0 after durationMs', () => {
    expect(fadeGain(6000, config)).toBe(0);
  });

  it('ramps from 0 to 1 during fade-in', () => {
    expect(fadeGain(0, config)).toBe(0);
    expect(fadeGain(500, config)).toBeCloseTo(0.5, 10);
    expect(fadeGain(1000, config)).toBeCloseTo(1, 10);
  });

  it('stays at 1 during steady region', () => {
    expect(fadeGain(1500, config)).toBe(1);
    expect(fadeGain(2500, config)).toBe(1);
    expect(fadeGain(4000, config)).toBe(1);
  });

  it('ramps from 1 to 0 during fade-out', () => {
    // fade-out starts at 5000 - 500 = 4500
    expect(fadeGain(4500, config)).toBeCloseTo(1, 10);
    expect(fadeGain(4750, config)).toBeCloseTo(0.5, 10);
    expect(fadeGain(5000, config)).toBe(0);
  });

  it('handles zero fade-in', () => {
    const noFadeIn: FadeConfig = { fadeInMs: 0, fadeOutMs: 500, durationMs: 5000 };
    expect(fadeGain(0, noFadeIn)).toBe(1); // no fade-in → immediately at 1
    expect(fadeGain(100, noFadeIn)).toBe(1);
  });

  it('handles zero fade-out', () => {
    const noFadeOut: FadeConfig = { fadeInMs: 1000, fadeOutMs: 0, durationMs: 5000 };
    expect(fadeGain(4999, noFadeOut)).toBe(1);
    expect(fadeGain(5000, noFadeOut)).toBe(0); // past duration
  });

  it('handles zero duration', () => {
    const zeroDuration: FadeConfig = { fadeInMs: 0, fadeOutMs: 0, durationMs: 0 };
    expect(fadeGain(0, zeroDuration)).toBe(0);
  });

  it('handles very short track with overlapping fade regions', () => {
    // fadeIn 600, fadeOut 600, duration 1000 → overlap in the middle
    const overlap: FadeConfig = { fadeInMs: 600, fadeOutMs: 600, durationMs: 1000 };
    expect(fadeGain(0, overlap)).toBe(0);
    expect(fadeGain(300, overlap)).toBeCloseTo(0.5, 10);
    // At 400ms: fadeInMs=600, so 400 < 600 → still in fade-in region
    // fade-in: 400/600 ≈ 0.667. The function returns the fade-in value since it checks fade-in first.
    expect(fadeGain(400, overlap)).toBeCloseTo(400 / 600, 10);
    // At 500ms: 500 < 600 → still in fade-in region → 500/600 ≈ 0.833
    expect(fadeGain(500, overlap)).toBeCloseTo(500 / 600, 10);
    expect(fadeGain(1000, overlap)).toBe(0);
  });
});

// ─── duckGain ───────────────────────────────────────────────────────────────

describe('duckGain', () => {
  const duckConfig: DuckingConfig = { duckRatio: 0.5, enabled: true };

  it('does not duck when disabled', () => {
    const disabled: DuckingConfig = { duckRatio: 0.5, enabled: false };
    expect(duckGain(0.8, true, disabled)).toBe(0.8);
  });

  it('does not duck when voiceover is not active', () => {
    expect(duckGain(0.8, false, duckConfig)).toBe(0.8);
  });

  it('ducks to 50% when voiceover is active (instant)', () => {
    expect(duckGain(0.8, true, duckConfig)).toBeCloseTo(0.4, 10);
  });

  it('returns 0 when baseGain is 0', () => {
    expect(duckGain(0, true, duckConfig)).toBe(0);
  });

  it('smooth: ramps from full to ducked over smoothing steps', () => {
    const state = { smoothingSteps: 4, currentStep: 0, voiceoverActive: true };
    // step 0: no ducking applied yet → full baseGain
    expect(duckGain(0.8, true, duckConfig, state)).toBeCloseTo(0.8, 10);

    // step 2 (halfway): 0.8 + (0.4 - 0.8) * 0.5 = 0.6
    expect(duckGain(0.8, true, duckConfig, { ...state, currentStep: 2 })).toBeCloseTo(0.6, 10);

    // step 4 (fully ducked): 0.4
    expect(duckGain(0.8, true, duckConfig, { ...state, currentStep: 4 })).toBeCloseTo(0.4, 10);

    // step 6 (clamped at 1): 0.4
    expect(duckGain(0.8, true, duckConfig, { ...state, currentStep: 6 })).toBeCloseTo(0.4, 10);
  });

  it('smooth with 0 steps falls back to instant', () => {
    const state = { smoothingSteps: 0, currentStep: 0, voiceoverActive: true };
    expect(duckGain(0.8, true, duckConfig, state)).toBeCloseTo(0.4, 10);
  });
});

// ─── backgroundGain ─────────────────────────────────────────────────────────

describe('backgroundGain', () => {
  const fadeConfig: FadeConfig = { fadeInMs: 1000, fadeOutMs: 500, durationMs: 5000 };
  const duckConfig: DuckingConfig = { duckRatio: 0.5, enabled: true };

  it('applies fade-in without ducking', () => {
    // playhead at 500ms → fadeGain = 0.5, no voiceover → no duck
    const result = backgroundGain(500, fadeConfig, duckConfig, { voiceoverActive: false });
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('applies ducking during voiceover in steady region', () => {
    // playhead at 2000ms → fadeGain = 1.0, voiceover active → 1.0 * 0.5 = 0.5
    const result = backgroundGain(2000, fadeConfig, duckConfig, { voiceoverActive: true });
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('combines fade-in and ducking', () => {
    // playhead at 500ms → fadeGain = 0.5, voiceover active → 0.5 * 0.5 = 0.25
    const result = backgroundGain(500, fadeConfig, duckConfig, { voiceoverActive: true });
    expect(result).toBeCloseTo(0.25, 10);
  });

  it('combines fade-out and ducking', () => {
    // playhead at 4750ms → fadeGain = 0.5, voiceover active → 0.5 * 0.5 = 0.25
    const result = backgroundGain(4750, fadeConfig, duckConfig, { voiceoverActive: true });
    expect(result).toBeCloseTo(0.25, 10);
  });

  it('returns 0 outside duration', () => {
    const result = backgroundGain(6000, fadeConfig, duckConfig, { voiceoverActive: true });
    expect(result).toBe(0);
  });
});
