/**
 * Video pipeline — transcoder backend interface (Phase 11).
 *
 * Mirrors the export-pipeline `{ unsupported: true }` pattern (P09 precedent).
 *
 * - `NoFfmpegBackend` (DEFAULT): every job completes with
 *   `{ unsupported: true, message: 'FFmpeg unavailable — transcoding deferred' }`.
 *   Tests use this exclusively.
 * - `FfmpegBackend` stub: documents the real ffmpeg shell-out command shape
 *   (gated behind an env check `hasFfmpeg()`; never invoked in CI tests).
 */

import type { VideoJob, TranscodeResult, UnsupportedTranscodeResult } from './types.js';

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

export interface TranscodeBackend {
  /**
   * Transcode a video job.  Returns either a successful `TranscodeResult`
   * with output URLs or an `{ unsupported: true }` sentinel when the
   * backend cannot perform the operation.
   */
  transcode(job: VideoJob): Promise<TranscodeResult | UnsupportedTranscodeResult>;
}

// ---------------------------------------------------------------------------
// hasFfmpeg — environment-gated availability check
// ---------------------------------------------------------------------------

export function hasFfmpeg(): boolean {
  // In CI and test environments, ffmpeg is not guaranteed.
  // Real deployments would check `process.env.FFMPEG_PATH` or
  // attempt a `ffmpeg -version` shell-out (see FfmpegBackend).
  return process.env['HAS_FFMPEG'] === 'true';
}

// ---------------------------------------------------------------------------
// NoFfmpegBackend (DEFAULT) — returns unsupported sentinel
// ---------------------------------------------------------------------------

export class NoFfmpegBackend implements TranscodeBackend {
  async transcode(_job: VideoJob): Promise<UnsupportedTranscodeResult> {
    return {
      unsupported: true,
      message: 'FFmpeg unavailable — transcoding deferred',
    };
  }
}

// ---------------------------------------------------------------------------
// FfmpegBackend stub — documents the real ffmpeg command shape
// ---------------------------------------------------------------------------

/**
 * Real ffmpeg backend (stub — never invoked in CI tests).
 *
 * The intended shell-out shape for a single rendition:
 *
 * ```bash
 * ffmpeg -y \
 *   -i <sourceUrl> \
 *   -vf "scale=-2:720" \
 *   -c:v libx264 -preset fast -crf 23 \
 *   -c:a aac -b:a 128k \
 *   -movflags +faststart \
 *   -f mp4 <outputPath>
 *
 * ffmpeg -y \
 *   -i <sourceUrl> \
 *   -vf "scale=-2:720" \
 *   -c:v libx264 -preset fast -crf 23 \
 *   -c:a aac -b:a 128k \
 *   -f hls \
 *   -hls_time 6 \
 *   -hls_playlist_type vod \
 *   -hls_segment_filename "<segmentPattern>" \
 *   <manifestPath>
 * ```
 *
 * For HLS, the manifest is an `.m3u8` file.
 * For DASH, use `-f dash` with `-seg_duration 6`.
 */
export class FfmpegBackend implements TranscodeBackend {
  async transcode(job: VideoJob): Promise<TranscodeResult | UnsupportedTranscodeResult> {
    if (!hasFfmpeg()) {
      return {
        unsupported: true,
        message: 'FFmpeg unavailable — transcoding deferred',
      };
    }

    // Real implementation would:
    // 1. For each rendition, spawn ffmpeg with the appropriate codec/scale args
    // 2. Produce HLS (.m3u8) and/or DASH (.mpd) manifests
    // 3. Extract captions via: ffmpeg -i <src> -map 0:s:0 captions.srt
    // 4. Extract waveform via: ffmpeg -i <src> -filter:a "astats=metadata=1:reset=1" ...
    // 5. Generate thumbnail via: ffmpeg -i <src> -ss 00:00:01 -frames:v 1 thumb.jpg

    // Stub: return placeholder URLs (never reached in CI)
    const result: TranscodeResult = {
      urls: {
        hls: `https://cdn.example.com/video/${job.id}/master.m3u8`,
        dash: `https://cdn.example.com/video/${job.id}/master.mpd`,
      },
      thumbnailUrl: `https://cdn.example.com/video/${job.id}/thumb.jpg`,
    };
    if (job.extractCaptions) {
      (result as { captionsUrl?: string }).captionsUrl =
        `https://cdn.example.com/video/${job.id}/captions.vtt`;
    }
    if (job.extractWaveform) {
      (result as { waveformUrl?: string }).waveformUrl =
        `https://cdn.example.com/video/${job.id}/waveform.json`;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTranscodeBackend(): TranscodeBackend {
  if (hasFfmpeg()) {
    return new FfmpegBackend();
  }
  return new NoFfmpegBackend();
}
