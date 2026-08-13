/**
 * @domio/viewer — Video runtime integration (Phase 11 M6.2).
 *
 * Wraps @domio/video primitives for the viewer's segment-aware
 * playback path:
 *   - segment selection (trim + chapter alignment)
 *   - caption list rendering (WebVTT)
 *   - chapter list navigation
 *   - accessibility: text-contrast protection for caption chrome
 *   - playback readiness via the transcode state machine
 *   - waveform bars for scrubbing UI
 *
 * The viewer never owns a `<video>` element directly; it receives
 * one from the host page and passes the HTMLVideoElement into the
 * runtime when present. All primitives are pure-TS so tests are
 * headless.
 */

import {
  getSegmentInfo,
  clipTrimToSource,
  parseVTT,
  generateVTT,
  createChapterList,
  getChapterAt,
  analyzeContrast,
  reduceTranscodeState,
  canPlay,
  computeWaveform,
  type TrimWindow,
  type SegmentInfo,
  type Cue,
  type ParseWarning,
  type Chapter,
  type ChapterList,
  type ContrastResult,
  type TranscodeState,
  type VideoAsset,
  type CanPlayResult,
  type WaveformResult,
} from '@domio/video';

// ─── Public types ────────────────────────────────────────────────────

export interface ViewerVideoSegmentSpec {
  readonly id: string;
  /** Source start in seconds (will be converted to ms). */
  readonly sourceStartSec: number;
  /** Source end in seconds. */
  readonly sourceEndSec: number;
  /** Segment duration in ms (defaults to 4000). */
  readonly segmentDurationMs?: number;
  /** Chapter title for navigation UI. */
  readonly title?: string;
  /** Caption track URL (WebVTT). */
  readonly vttUrl?: string;
}

export interface ViewerVideoRuntimeConfig {
  /** Total source duration in ms. */
  readonly sourceDurationMs: number;
  readonly segments: readonly ViewerVideoSegmentSpec[];
  readonly waveformBars?: number;
}

export interface CaptionParseOutput {
  readonly cues: readonly Cue[];
  readonly warnings: readonly ParseWarning[];
}

export interface ViewerVideoRuntime {
  /** Compute segment metadata for a playhead position. */
  segmentAt(segmentIndex: number, playheadMs: number): SegmentInfo;
  /** Clip a trim window to the source duration. */
  clipTrim(trim: TrimWindow): TrimWindow | undefined;
  /** Parse a WebVTT caption file into cues + warnings. */
  captions(vtt: string): CaptionParseOutput;
  /** Generate WebVTT from cue objects (e.g. for export). */
  exportCues(cues: readonly Cue[]): string;
  /** Build the chapter list for the configured segments. */
  chapters(): ChapterList;
  /** Find the active chapter at a given playback time (ms). */
  chapterAt(timeMs: number): Chapter | undefined;
  /** Contrast protection for caption chrome against a luminance frame. */
  captionContrast(luma: Float32Array, pixelCount: number): ContrastResult;
  /** Decide whether to autoplay given the asset state machine. */
  readiness(asset: VideoAsset): CanPlayResult;
  /** Reduce a transcode event into the next state. */
  step(state: TranscodeState, event: 'start' | 'complete' | 'error'): TranscodeState;
  /** Compute waveform bars for the scrubbing UI. */
  waveform(samples: Float32Array | readonly number[]): WaveformResult;
  /** Tear down internal caches. */
  destroy(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────

const DEFAULT_SEGMENT_DURATION_MS = 4_000;

export function createViewerVideoRuntime(config: ViewerVideoRuntimeConfig): ViewerVideoRuntime {
  let chapters: ChapterList | null = null;
  const parsedCueCache = new Map<string, CaptionParseOutput>();
  const segmentDurationMs = (i: number): number =>
    config.segments[i]?.segmentDurationMs ?? DEFAULT_SEGMENT_DURATION_MS;

  function refreshChapters(): ChapterList {
    const ch: Chapter[] = config.segments.map((s, i) => ({
      title: s.title ?? `Chapter ${i + 1}`,
      startMs: Math.round(s.sourceStartSec * 1000),
    }));
    chapters = createChapterList(ch);
    return chapters;
  }

  refreshChapters();

  return {
    segmentAt(segmentIndex: number, playheadMs: number): SegmentInfo {
      return getSegmentInfo(config.sourceDurationMs, segmentDurationMs(segmentIndex), playheadMs);
    },

    clipTrim(trim: TrimWindow): TrimWindow | undefined {
      return clipTrimToSource(config.sourceDurationMs, trim);
    },

    captions(vtt: string): CaptionParseOutput {
      const cached = parsedCueCache.get(vtt);
      if (cached) return cached;
      const result = parseVTT(vtt);
      const out: CaptionParseOutput = {
        cues: result.cues,
        warnings: result.warnings,
      };
      parsedCueCache.set(vtt, out);
      return out;
    },

    exportCues(cues: readonly Cue[]): string {
      return generateVTT(
        cues.map((c) => ({
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
        })),
      );
    },

    chapters(): ChapterList {
      if (!chapters) refreshChapters();
      return chapters!;
    },

    chapterAt(timeMs: number): Chapter | undefined {
      return getChapterAt(this.chapters(), timeMs);
    },

    captionContrast(luma: Float32Array, pixelCount: number): ContrastResult {
      return analyzeContrast(luma, pixelCount);
    },

    readiness(asset: VideoAsset): CanPlayResult {
      return canPlay(asset);
    },

    step(state: TranscodeState, event: 'start' | 'complete' | 'error'): TranscodeState {
      return reduceTranscodeState(state, event);
    },

    waveform(samples: Float32Array | readonly number[]): WaveformResult {
      return computeWaveform(
        samples instanceof Float32Array ? samples : Float32Array.from(samples),
        config.waveformBars ?? 48,
      );
    },

    destroy(): void {
      chapters = null;
      parsedCueCache.clear();
    },
  };
}
