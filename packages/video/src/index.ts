/**
 * @domio/video — Video client package
 *
 * HLS/DASH playback, segmented trimming, captions, chapters,
 * contrast map, waveform. Phase 11.
 *
 * Zero runtime dependencies. Pure TypeScript, headless-testable.
 */

// Playback — segment selection for HLS/DASH
export { getSegmentInfo, clipTrimToSource, type TrimWindow, type SegmentInfo } from './playback.js';

// Captions — WebVTT parser and generator
export {
  parseVTT,
  generateVTT,
  type Cue,
  type ParseWarning,
  type ParseResult,
} from './captions.js';

// Chapters — chapter list from title markers
export { createChapterList, getChapterAt, type Chapter, type ChapterList } from './chapters.js';

// Transcode — state machine model
export {
  reduceTranscodeState,
  canPlay,
  type TranscodeState,
  type VideoAsset,
  type CanPlayResult,
} from './transcode.js';

// Contrast — WCAG-Accessible text-contrast protection
export { analyzeContrast, type ContrastResult } from './contrast.js';

// Waveform — audio waveform bar computation
export { computeWaveform, type WaveformBar, type WaveformResult } from './waveform.js';
