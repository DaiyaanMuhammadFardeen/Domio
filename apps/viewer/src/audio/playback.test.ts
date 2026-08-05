/**
 * @domio/viewer — Tests for audio playback runtime (M7.1).
 */

import { describe, it, expect } from 'vitest';
import {
  createViewerAudioRuntime,
  fadeConfigFor,
  duckConfigFor,
  type ViewerAudioConfig,
} from './playback.js';

const CONFIG: ViewerAudioConfig = {
  globalVolume: 1,
  masterVolume: 0.9,
  tracks: [
    { id: 'music', kind: 'music', volume: 0.8, durationMs: 30_000, fadeInMs: 200, fadeOutMs: 500 },
    { id: 'vo',    kind: 'voiceover', volume: 1.0, durationMs: 10_000, fadeOutMs: 100 },
    { id: 'sfx',   kind: 'sfx', volume: 0.6, durationMs: 500 },
  ],
};

describe('createViewerAudioRuntime', () => {
  it('produces a GainBusState with the configured tracks', () => {
    const rt = createViewerAudioRuntime();
    const state = rt.apply(CONFIG);
    expect(state.globalVolume).toBe(1);
    expect(state.masterVolume).toBe(0.9);
    expect(state.tracks.map((t) => t.id).sort()).toEqual(['music', 'sfx', 'vo']);
  });

  it('computes per-track gains with global × master × volume', () => {
    const rt = createViewerAudioRuntime();
    const state = rt.apply(CONFIG);
    const gains = rt.allGains(state);
    const music = gains.get('music')!;
    const expected = 1 * 0.9 * 0.8;
    expect(music).toBeCloseTo(expected, 5);
    expect(state.tracks[0]!.volume).toBe(0.8);
  });

  it('returns 0 for muted or unknown tracks', () => {
    const rt = createViewerAudioRuntime();
    const state = rt.apply({
      ...CONFIG,
      tracks: [
        { id: 'm', kind: 'sfx', volume: 1, mute: true, durationMs: 100 },
      ],
    });
    expect(rt.trackGain(state, 'm')).toBe(0);
    expect(rt.trackGain(state, 'unknown')).toBe(0);
  });

  it('computes pan and clamps', () => {
    const rt = createViewerAudioRuntime();
    const state = rt.apply({
      ...CONFIG,
      tracks: [
        { id: 'left',  kind: 'music', volume: 1, pan: -2, durationMs: 100 },
        { id: 'right', kind: 'music', volume: 1, pan:  2, durationMs: 100 },
      ],
    });
    expect(rt.trackPan(state, 'left')).toBe(-1);
    expect(rt.trackPan(state, 'right')).toBe(1);
  });

  it('fade envelope ramps correctly', () => {
    const rt = createViewerAudioRuntime();
    const cfg = fadeConfigFor({
      id: 't', kind: 'music', durationMs: 1000, fadeInMs: 200, fadeOutMs: 200,
    });
    expect(rt.fade(0, cfg)).toBe(0);
    expect(rt.fade(100, cfg)).toBeCloseTo(0.5, 5);
    expect(rt.fade(200, cfg)).toBe(1);
    expect(rt.fade(800, cfg)).toBeCloseTo(1, 5);
    expect(rt.fade(900, cfg)).toBeCloseTo(0.5, 5);
    expect(rt.fade(1000, cfg)).toBe(0);
    expect(rt.fade(2000, cfg)).toBe(0);
  });

  it('duck multiplier lowers gain when voiceover is active', () => {
    const rt = createViewerAudioRuntime();
    const cfg = duckConfigFor(0.25, true);
    expect(rt.duck(1, false, cfg)).toBe(1);
    expect(rt.duck(1, true, cfg)).toBe(0.25);
  });

  it('ducking multiplies fade gain for background tracks', () => {
    const rt = createViewerAudioRuntime();
    const fade = fadeConfigFor({
      id: 'bg', kind: 'music', durationMs: 1000, fadeInMs: 0, fadeOutMs: 0,
    });
    const duck = duckConfigFor(0.5, true);
    expect(rt.background(500, fade, duck, { voiceoverActive: false })).toBe(1);
    expect(rt.background(500, fade, duck, { voiceoverActive: true })).toBe(0.5);
  });

  it('drift picks the right strategy and updates state', () => {
    const rt = createViewerAudioRuntime();
    const initial = { lastOffsetMs: 0, cumulativeMs: 0, reSyncCount: 0 };
    const small = rt.drift(initial, 50);
    expect(small.strategy).toBe('none');
    expect(small.needsReSync).toBe(false);

    const medium = rt.drift(initial, 150);
    expect(medium.strategy).toBe('resample');

    const huge = rt.drift(initial, 500);
    expect(huge.strategy).toBe('pause-and-realign');
    expect(huge.needsReSync).toBe(true);
    expect(huge.state.reSyncCount).toBe(1);
  });

  it('driftOk checks absolute offset against budget', () => {
    const rt = createViewerAudioRuntime({ tracks: [], driftBudgetMs: 100 });
    expect(rt.driftOk(50)).toBe(true);
    expect(rt.driftOk(-50)).toBe(true);
    expect(rt.driftOk(150)).toBe(false);
  });

  it('destroy resets internal state', () => {
    const rt = createViewerAudioRuntime();
    rt.apply(CONFIG);
    rt.destroy();
    const state = rt.apply({ tracks: [] });
    expect(state.tracks.length).toBe(0);
  });
});