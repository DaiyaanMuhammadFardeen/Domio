/**
 * @domio/audio — WebAudioMixer + ExportMixer tests (Phase 11, M7.1).
 *
 * Uses a fake AudioContextLike so the tests never touch real Web Audio.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WebAudioMixer,
  ExportMixer,
  type AudioContextLike,
  type GainNodeLike,
  type AudioParamLike,
  type PannerNodeLike,
  type AudioDestinationLike,
  type AudioNodeLike,
} from './index.js';
import type { TrackConfig } from './index.js';
import type {
  ExportBusContext,
  ExportGainNode,
  ExportDestination,
  ExportAudioNode,
} from './exportBus.js';

// ---------------------------------------------------------------------------
// Fake AudioContextLike
// ---------------------------------------------------------------------------

function makeFakeContext(): AudioContextLike & { log: string[] } {
  const log: string[] = [];
  const destination: AudioDestinationLike = {
    connect: (_d: AudioNodeLike) => { log.push('destination.connect'); },
    channelCount: 2,
  };
  const ctx: AudioContextLike & { log: string[] } = {
    log,
    destination,
    createGain: (): GainNodeLike => {
      const audioParam: AudioParamLike = {
        value: 1,
        linearRampToValueAtTime: (v: number, _t: number) => {
          audioParam.value = v;
          log.push(`linearRamp(${v})`);
        },
        setValueAtTime: (v: number, _t: number) => {
          audioParam.value = v;
          log.push(`setValue(${v})`);
        },
      };
      return {
        gain: audioParam,
        connect: (_d: AudioNodeLike) => { log.push('gain.connect'); },
        disconnect: () => { log.push('gain.disconnect'); },
      };
    },
    createPanner: (): PannerNodeLike => {
      const audioParam: AudioParamLike = {
        value: 0,
        linearRampToValueAtTime: () => {},
        setValueAtTime: () => {},
      };
      return {
        pan: audioParam,
        connect: (_d: AudioNodeLike) => { log.push('panner.connect'); },
        disconnect: () => { log.push('panner.disconnect'); },
      };
    },
  };
  return ctx;
}

function makeFakeExportContext(): ExportBusContext & { samples: Float32Array } {
  let samples: Float32Array = new Float32Array(0);
  const destination: ExportDestination = { channelCount: 2 };
  const ctx: ExportBusContext & { samples: Float32Array } = {
    samples,
    destination,
    createGain: (): ExportGainNode => {
      const gain: ExportGainNode = {
        gain: { value: 1 },
        connect: (_d: ExportAudioNode): void => {},
        disconnect: (): void => {},
      };
      return gain;
    },
  };
  // Wire the .samples getter/setter to track mutation
  Object.defineProperty(ctx, 'samples', {
    get() { return samples; },
    set(v: Float32Array) { samples = v; },
  });
  return ctx;
}

const trackA: TrackConfig = {
  id: 'a',
  kind: 'music',
  volume: 0.8,
  pan: 0,
  mute: false,
  durationMs: 30_000,
};

const trackB: TrackConfig = {
  id: 'b',
  kind: 'voiceover',
  volume: 1,
  pan: -0.5,
  mute: false,
  durationMs: 5_000,
};

describe('WebAudioMixer', () => {
  let ctx: ReturnType<typeof makeFakeContext>;
  let now: number;

  beforeEach(() => {
    ctx = makeFakeContext();
    now = 1_000;
  });

  it('initializes with empty track list', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    expect(mixer.tracks).toHaveLength(0);
    const snap = mixer.snapshot();
    expect(snap.trackCount).toBe(0);
    expect(snap.startedAt).toBeNull();
  });

  it('setTracks replaces the track set', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([trackA, trackB]);
    expect(mixer.tracks).toHaveLength(2);
    const snap = mixer.snapshot();
    expect(snap.trackCount).toBe(2);
  });

  it('addTrack appends and removeTrack drops by id', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.addTrack(trackA);
    mixer.addTrack(trackB);
    expect(mixer.tracks).toHaveLength(2);
    const removed = mixer.removeTrack('a');
    expect(removed).toBe(true);
    expect(mixer.tracks).toHaveLength(1);
    expect(mixer.tracks[0]!.id).toBe('b');
  });

  it('removeTrack returns false for unknown id', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.addTrack(trackA);
    expect(mixer.removeTrack('zzz')).toBe(false);
  });

  it('patchTrack updates volume/pan/mute in place', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.addTrack(trackA);
    const ok = mixer.patchTrack('a', { volume: 0.5, pan: 0.2, mute: true });
    expect(ok).toBe(true);
    const updated = mixer.tracks.find((t) => t.id === 'a')!;
    expect(updated.volume).toBe(0.5);
    expect(updated.pan).toBe(0.2);
    expect(updated.mute).toBe(true);
  });

  it('patchTrack returns false for unknown id', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    expect(mixer.patchTrack('missing', { volume: 0 })).toBe(false);
  });

  it('setGlobalVolume clamps to [0,1]', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setGlobalVolume(2.0);
    expect(mixer.snapshot().globalVolume).toBe(1.0);
    mixer.setGlobalVolume(-1.0);
    expect(mixer.snapshot().globalVolume).toBe(0.0);
  });

  it('setMasterVolume clamps to [0,1]', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setMasterVolume(1.5);
    expect(mixer.snapshot().masterVolume).toBe(1.0);
  });

  it('start wires nodes and stamps startedAt', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([trackA, trackB]);
    const t = mixer.start(now);
    expect(t).toBe(now);
    expect(mixer.snapshot().startedAt).toBe(now);
    // Each track wires its gain → destination
    const gainConnects = ctx.log.filter((l: string) => l === 'gain.connect').length;
    expect(gainConnects).toBe(2);
    mixer.close();
  });

  it('start is idempotent', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([trackA]);
    expect(mixer.start(now)).toBe(now);
    expect(mixer.start(now + 100)).toBe(now);
    mixer.close();
  });

  it('start applies fadeInMs envelope', () => {
    const mixer = new WebAudioMixer(ctx, { fadeInMs: 500 }, () => now);
    mixer.setTracks([trackA]);
    mixer.start(now);
    expect(ctx.log.some((l: string) => l.startsWith('setValue(0)'))).toBe(true);
    expect(ctx.log.some((l: string) => l.startsWith('linearRamp('))).toBe(true);
    mixer.close();
  });

  it('stop records stoppedAt', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([trackA]);
    mixer.start(now);
    const t = mixer.stop(now + 100);
    expect(t).toBe(now + 100);
    expect(mixer.snapshot().stoppedAt).toBe(now + 100);
    mixer.close();
  });

  it('stop before start returns 0', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    expect(mixer.stop(now)).toBe(0);
  });

  it('close tears down and idempotent', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([trackA]);
    mixer.start(now);
    mixer.close();
    mixer.close();
    expect(mixer.snapshot().startedAt).toBeNull();
  });

  it('gainOf and panOf return per-track effective values', () => {
    const mixer = new WebAudioMixer(ctx, { globalVolume: 0.5, masterVolume: 0.5 }, () => now);
    mixer.setTracks([trackA, trackB]);
    // global * master * volume * mute factor
    expect(mixer.gainOf('a')).toBeCloseTo(0.5 * 0.5 * 0.8, 5);
    expect(mixer.panOf('b')).toBe(-0.5);
  });

  it('muted track has 0 gain', () => {
    const mixer = new WebAudioMixer(ctx, {}, () => now);
    mixer.setTracks([{ ...trackA, mute: true }]);
    expect(mixer.gainOf('a')).toBe(0);
  });
});

describe('ExportMixer', () => {
  it('combines WebAudioMixer + ExportBus', () => {
    const renderCtx = makeFakeContext();
    const exportCtx = makeFakeExportContext();
    const em = new ExportMixer(renderCtx, exportCtx as unknown as ExportBusContext, { sampleRate: 48000, channels: 2 });
    em.setTracks([trackA, trackB]);
    // mixer should have 2 user tracks + 1 capture track
    expect(em.mixer.tracks.length).toBeGreaterThanOrEqual(3);

    // Inject samples and capture
    em.bus._capturedSamples.set(new Float32Array([0, 0, 1, -1]));
    const uri = em.toWavUri();
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    em.close();
  });

  it('close is safe to call once', () => {
    const renderCtx = makeFakeContext();
    const exportCtx = makeFakeExportContext();
    const em = new ExportMixer(renderCtx, exportCtx as unknown as ExportBusContext);
    em.setTracks([trackA]);
    em.close();
    em.close();
  });
});
