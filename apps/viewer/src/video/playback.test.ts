/**
 * @domio/viewer — Tests for video playback runtime (M6.2).
 */

import { describe, it, expect } from 'vitest';
import { createViewerVideoRuntime, type ViewerVideoRuntimeConfig } from './playback.js';

const CONFIG: ViewerVideoRuntimeConfig = {
  sourceDurationMs: 60_000,
  waveformBars: 16,
  segments: [
    { id: 'intro', sourceStartSec: 0, sourceEndSec: 20, title: 'Intro' },
    { id: 'main', sourceStartSec: 20, sourceEndSec: 50, title: 'Main', segmentDurationMs: 8_000 },
    { id: 'outro', sourceStartSec: 50, sourceEndSec: 60, title: 'Outro' },
  ],
};

const VTT = `WEBVTT

00:00:01.000 --> 00:00:03.500
Hello, world.

00:00:04.000 --> 00:00:06.000
Second cue.
`;

describe('createViewerVideoRuntime', () => {
  it('returns segment metadata for a playhead position', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const seg = rt.segmentAt(0, 5_000);
    expect(seg.segmentIndex).toBeGreaterThanOrEqual(0);
    expect(seg.totalSegments).toBeGreaterThan(0);
  });

  it('clips an in-range trim window', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const clipped = rt.clipTrim({ inMs: 5_000, outMs: 50_000 });
    expect(clipped).toEqual({ inMs: 5_000, outMs: 50_000 });
  });

  it('returns undefined when trim is entirely outside the source', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    expect(rt.clipTrim({ inMs: 90_000, outMs: 120_000 })).toBeUndefined();
    expect(rt.clipTrim({ inMs: 60_000, outMs: 70_000 })).toBeUndefined();
  });

  it('parses and round-trips a WebVTT payload', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const parsed = rt.captions(VTT);
    expect(parsed.cues.length).toBe(2);
    expect(parsed.cues[0]?.text).toBe('Hello, world.');
    expect(parsed.warnings.length).toBe(0);

    const exported = rt.exportCues(parsed.cues);
    expect(exported).toContain('WEBVTT');
    expect(exported).toContain('00:00:01.000 --> 00:00:03.500');
    expect(exported).toContain('Hello, world.');
  });

  it('builds a chapter list sorted by start time', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const list = rt.chapters();
    expect(list.chapters.length).toBe(3);
    expect(list.chapters[0]?.title).toBe('Intro');
  });

  it('resolves the active chapter at a given time', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const ch = rt.chapterAt(25_000);
    expect(ch?.title).toBe('Main');
  });

  it('returns undefined for time before the first chapter', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    // 25s in seconds = 25_000 ms, which is past start of "Main" (20s)
    const ch = rt.chapterAt(-100);
    expect(ch).toBeUndefined();
  });

  it('canPlay returns true when transcoded or original is playable', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    expect(
      rt.readiness({
        transcodeState: 'ready',
        hasPlayableOriginal: false,
        hlsUrl: 'https://example.com/m.m3u8',
        dashUrl: null,
      }).canPlay,
    ).toBe(true);

    expect(
      rt.readiness({
        transcodeState: 'queued',
        hasPlayableOriginal: true,
        hlsUrl: null,
        dashUrl: null,
      }).canPlay,
    ).toBe(true);
  });

  it('canPlay blocks when transcoding and no original playable', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    expect(
      rt.readiness({
        transcodeState: 'processing',
        hasPlayableOriginal: false,
        hlsUrl: null,
        dashUrl: null,
      }),
    ).toEqual({ canPlay: false, reason: 'Transcode pending' });

    expect(
      rt.readiness({
        transcodeState: 'failed',
        hasPlayableOriginal: false,
        hlsUrl: null,
        dashUrl: null,
      }),
    ).toEqual({ canPlay: false, reason: 'Transcode failed' });
  });

  it('reduces through the transcode state machine', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    expect(rt.step('queued', 'start')).toBe('processing');
    expect(rt.step('processing', 'complete')).toBe('ready');
    expect(() => rt.step('ready', 'start')).toThrow();
  });

  it('contrast analyzer picks light text on dark background', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const luma = new Float32Array(64 * 64);
    for (let i = 0; i < luma.length; i++) luma[i] = 0.1; // all dark
    const result = rt.captionContrast(luma, 64 * 64);
    expect(result.meanLuma).toBeCloseTo(0.1, 5);
    expect(result.labelColor).toBe('light');
  });

  it('contrast analyzer picks dark text on light background', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const luma = new Float32Array(64 * 64);
    for (let i = 0; i < luma.length; i++) luma[i] = 0.9; // all bright
    const result = rt.captionContrast(luma, 64 * 64);
    expect(result.meanLuma).toBeCloseTo(0.9, 5);
    expect(result.labelColor).toBe('dark');
    expect(result.shadow).toBe(false);
  });

  it('computes waveform bars from samples', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    const samples = new Float32Array(1600);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 0.5 : -0.5;
    }
    const wf = rt.waveform(samples);
    expect(wf.bars.length).toBe(CONFIG.waveformBars);
    expect(wf.bars[0]?.min).toBeCloseTo(-0.5, 5);
    expect(wf.bars[0]?.max).toBeCloseTo(0.5, 5);
  });

  it('destroy clears the chapter cache and parsed-cue cache', () => {
    const rt = createViewerVideoRuntime(CONFIG);
    rt.captions(VTT);
    rt.destroy();
    // After destroy, parsing the same VTT again still works (cache miss).
    const parsed = rt.captions(VTT);
    expect(parsed.cues.length).toBe(2);
  });
});
