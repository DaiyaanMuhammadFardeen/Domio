/**
 * Video pipeline — transcoder tests (Phase 11).
 *
 * Covers:
 * - NoFfmpegBackend returns { unsupported: true } for every job
 * - NoFfmpegBackend message matches P09 precedent
 * - hasFfmpeg() env check
 * - FfmpegBackend falls back to unsupported when env unset
 * - createTranscodeBackend factory picks correct backend
 */

import { describe, it, expect, afterEach } from 'vitest';
import { NoFfmpegBackend, FfmpegBackend, hasFfmpeg, createTranscodeBackend } from './transcoder.js';
import type { VideoJob } from './types.js';

function makeJob(overrides?: Partial<VideoJob>): VideoJob {
  return {
    id: 'job-test-1',
    videoAssetId: 'asset-1',
    renditions: ['720p', '1080p'],
    extractCaptions: true,
    extractWaveform: true,
    priority: 'normal',
    status: 'queued',
    statusUrl: '/v1/video_jobs/job-test-1',
    createdAt: '2026-08-05T00:00:00Z',
    ...overrides,
  };
}

describe('NoFfmpegBackend', () => {
  it('returns { unsupported: true } for any job', async () => {
    const backend = new NoFfmpegBackend();
    const result = await backend.transcode(makeJob());
    expect(result).toEqual({
      unsupported: true,
      message: 'FFmpeg unavailable — transcoding deferred',
    });
  });

  it('result has unsupported: true sentinel', async () => {
    const backend = new NoFfmpegBackend();
    const result = await backend.transcode(makeJob());
    expect('unsupported' in result && result.unsupported).toBe(true);
  });

  it('returns same result regardless of job fields', async () => {
    const backend = new NoFfmpegBackend();
    const result1 = await backend.transcode(makeJob({ extractCaptions: false }));
    const result2 = await backend.transcode(makeJob({ extractCaptions: true, priority: 'high' }));
    expect(result1).toEqual(result2);
  });

  it('message matches P09 precedent string', async () => {
    const backend = new NoFfmpegBackend();
    const result = await backend.transcode(makeJob());
    expect('message' in result && result.message).toBe('FFmpeg unavailable — transcoding deferred');
  });
});

describe('hasFfmpeg', () => {
  afterEach(() => {
    delete process.env['HAS_FFMPEG'];
  });

  it('returns false by default', () => {
    delete process.env['HAS_FFMPEG'];
    expect(hasFfmpeg()).toBe(false);
  });

  it('returns true when HAS_FFMPEG=true', () => {
    process.env['HAS_FFMPEG'] = 'true';
    expect(hasFfmpeg()).toBe(true);
  });

  it('returns false for non-true values', () => {
    process.env['HAS_FFMPEG'] = '1';
    expect(hasFfmpeg()).toBe(false);
    process.env['HAS_FFMPEG'] = 'yes';
    expect(hasFfmpeg()).toBe(false);
  });
});

describe('FfmpegBackend', () => {
  afterEach(() => {
    delete process.env['HAS_FFMPEG'];
  });

  it('returns unsupported when HAS_FFMPEG is unset', async () => {
    delete process.env['HAS_FFMPEG'];
    const backend = new FfmpegBackend();
    const result = await backend.transcode(makeJob());
    expect('unsupported' in result && result.unsupported).toBe(true);
  });

  it('message matches NoFfmpegBackend when unsupported', async () => {
    delete process.env['HAS_FFMPEG'];
    const backend = new FfmpegBackend();
    const result = await backend.transcode(makeJob());
    expect('message' in result && result.message).toBe('FFmpeg unavailable — transcoding deferred');
  });
});

describe('createTranscodeBackend factory', () => {
  afterEach(() => {
    delete process.env['HAS_FFMPEG'];
  });

  it('returns NoFfmpegBackend when HAS_FFMPEG is unset', () => {
    delete process.env['HAS_FFMPEG'];
    const backend = createTranscodeBackend();
    expect(backend).toBeInstanceOf(NoFfmpegBackend);
  });

  it('returns FfmpegBackend when HAS_FFMPEG=true', () => {
    process.env['HAS_FFMPEG'] = 'true';
    const backend = createTranscodeBackend();
    expect(backend).toBeInstanceOf(FfmpegBackend);
  });
});
