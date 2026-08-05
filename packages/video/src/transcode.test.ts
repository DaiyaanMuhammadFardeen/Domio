import { describe, it, expect } from 'vitest';
import { reduceTranscodeState, canPlay } from './transcode.js';

describe('reduceTranscodeState', () => {
  it('queued → start → processing', () => {
    expect(reduceTranscodeState('queued', 'start')).toBe('processing');
  });

  it('processing → complete → ready', () => {
    expect(reduceTranscodeState('processing', 'complete')).toBe('ready');
  });

  it('processing → error → failed', () => {
    expect(reduceTranscodeState('processing', 'error')).toBe('failed');
  });

  it('rejects queued → complete', () => {
    expect(() => reduceTranscodeState('queued', 'complete')).toThrow('Invalid transition');
  });

  it('rejects queued → error', () => {
    expect(() => reduceTranscodeState('queued', 'error')).toThrow('Invalid transition');
  });

  it('rejects ready → start', () => {
    expect(() => reduceTranscodeState('ready', 'start')).toThrow('Invalid transition');
  });

  it('rejects ready → complete', () => {
    expect(() => reduceTranscodeState('ready', 'complete')).toThrow('Invalid transition');
  });

  it('rejects ready → error', () => {
    expect(() => reduceTranscodeState('ready', 'error')).toThrow('Invalid transition');
  });

  it('rejects failed → start', () => {
    expect(() => reduceTranscodeState('failed', 'start')).toThrow('Invalid transition');
  });

  it('rejects failed → complete', () => {
    expect(() => reduceTranscodeState('failed', 'complete')).toThrow('Invalid transition');
  });

  it('rejects unknown action', () => {
    expect(() => reduceTranscodeState('queued', 'unknown' as 'start')).toThrow('Unknown action');
  });

  it('full lifecycle: queued → processing → ready', () => {
    let state: 'queued' | 'processing' | 'ready' | 'failed' = 'queued';
    state = reduceTranscodeState(state, 'start');
    expect(state).toBe('processing');
    state = reduceTranscodeState(state, 'complete');
    expect(state).toBe('ready');
  });

  it('full lifecycle: queued → processing → failed', () => {
    let state: 'queued' | 'processing' | 'ready' | 'failed' = 'queued';
    state = reduceTranscodeState(state, 'start');
    expect(state).toBe('processing');
    state = reduceTranscodeState(state, 'error');
    expect(state).toBe('failed');
  });
});

describe('canPlay', () => {
  it('can play when state is ready', () => {
    const result = canPlay({
      transcodeState: 'ready',
      hasPlayableOriginal: false,
      hlsUrl: 'https://example.com/video.m3u8',
      dashUrl: null,
    });
    expect(result.canPlay).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('can play when hasPlayableOriginal is true (queued)', () => {
    const result = canPlay({
      transcodeState: 'queued',
      hasPlayableOriginal: true,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(true);
  });

  it('can play when hasPlayableOriginal is true (processing)', () => {
    const result = canPlay({
      transcodeState: 'processing',
      hasPlayableOriginal: true,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(true);
  });

  it('can play when hasPlayableOriginal is true (failed)', () => {
    const result = canPlay({
      transcodeState: 'failed',
      hasPlayableOriginal: true,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(true);
  });

  it('blocked when queued and no playable original', () => {
    const result = canPlay({
      transcodeState: 'queued',
      hasPlayableOriginal: false,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(false);
    expect(result.reason).toBe('Transcode pending');
  });

  it('blocked when processing and no playable original', () => {
    const result = canPlay({
      transcodeState: 'processing',
      hasPlayableOriginal: false,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(false);
    expect(result.reason).toBe('Transcode pending');
  });

  it('blocked when failed and no playable original', () => {
    const result = canPlay({
      transcodeState: 'failed',
      hasPlayableOriginal: false,
      hlsUrl: null,
      dashUrl: null,
    });
    expect(result.canPlay).toBe(false);
    expect(result.reason).toBe('Transcode failed');
  });

  it('can play ready even without playable original', () => {
    const result = canPlay({
      transcodeState: 'ready',
      hasPlayableOriginal: false,
      hlsUrl: 'https://example.com/video.m3u8',
      dashUrl: null,
    });
    expect(result.canPlay).toBe(true);
  });
});
