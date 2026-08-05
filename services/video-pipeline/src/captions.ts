/**
 * Video pipeline — caption extraction and waveform metadata (Phase 11).
 *
 * Caption extraction: produces a WebVTT string from a recorded fixture
 * (a transcript array) via a generator — pure string builder.
 *
 * Waveform extraction: produces a waveform metadata object (bar count 48)
 * from recorded sample arrays.
 *
 * These fixtures follow the recorded-provider pattern — real extraction
 * is performed by the ffmpeg backend (see transcoder.ts).
 */

// ---------------------------------------------------------------------------
// Transcript fixture (recorded provider pattern)
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/** Recorded transcript fixture for a sample 30-second video. */
export const SAMPLE_TRANSCRIPT: readonly TranscriptLine[] = [
  { startMs: 1000, endMs: 3500, text: 'Welcome to the domio platform.' },
  { startMs: 4000, endMs: 7200, text: 'Today we will explore video transcoding.' },
  { startMs: 8000, endMs: 11500, text: 'The pipeline supports HLS and DASH output.' },
  { startMs: 12000, endMs: 15000, text: 'Caption extraction generates WebVTT.' },
  { startMs: 16000, endMs: 19800, text: 'Waveform data powers audio visualizations.' },
  { startMs: 20000, endMs: 23000, text: 'Priority queuing ensures fair scheduling.' },
  { startMs: 24000, endMs: 27500, text: 'Transcoding completes asynchronously.' },
  { startMs: 28000, endMs: 30000, text: 'Thank you for watching.' },
];

// ---------------------------------------------------------------------------
// WebVTT generator (pure string builder)
// ---------------------------------------------------------------------------

/**
 * Format milliseconds to WebVTT timestamp: `HH:MM:SS.mmm`
 */
export function formatVttTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Generator that yields WebVTT cue strings from transcript lines.
 * Pure string builder — no I/O.
 */
export function* generateVttCues(lines: Iterable<TranscriptLine>): Generator<string> {
  for (const line of lines) {
    const start = formatVttTimestamp(line.startMs);
    const end = formatVttTimestamp(line.endMs);
    yield `${start} --> ${end}\n${line.text}`;
  }
}

/**
 * Produce a complete WebVTT document from a transcript array.
 */
export function generateWebVTT(lines: readonly TranscriptLine[]): string {
  const header = 'WEBVTT\n\n';
  const cues: string[] = [];
  for (const cue of generateVttCues(lines)) {
    cues.push(cue);
  }
  return header + cues.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Waveform metadata (recorded provider pattern)
// ---------------------------------------------------------------------------

export const WAVEFORM_BAR_COUNT = 48;

export interface WaveformMetadata {
  readonly barCount: number;
  readonly bars: readonly number[];
}

/** Recorded sample data fixture for a sample 30-second video. */
export const SAMPLE_WAVEFORM_SAMPLES: readonly number[] = [
  0.12, 0.34, 0.56, 0.78, 0.90, 0.45, 0.23, 0.67,
  0.89, 0.11, 0.33, 0.55, 0.77, 0.99, 0.88, 0.66,
  0.44, 0.22, 0.10, 0.30, 0.50, 0.70, 0.91, 0.73,
  0.53, 0.35, 0.15, 0.85, 0.65, 0.43, 0.21, 0.95,
  0.75, 0.57, 0.39, 0.18, 0.82, 0.62, 0.42, 0.25,
  0.08, 0.92, 0.72, 0.52, 0.32, 0.14, 0.86, 0.68,
];

/**
 * Extract waveform metadata from raw audio samples.
 * Downsamples to `WAVEFORM_BAR_COUNT` bars using average amplitude per bucket.
 * Returns a recorded-provider fixture — real extraction is the ffmpeg backend.
 */
export function extractWaveformMetadata(samples: readonly number[]): WaveformMetadata {
  if (samples.length === 0) {
    return { barCount: WAVEFORM_BAR_COUNT, bars: new Array(WAVEFORM_BAR_COUNT).fill(0) };
  }

  const bucketSize = Math.ceil(samples.length / WAVEFORM_BAR_COUNT);
  const bars: number[] = [];

  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, samples.length);
    if (start >= samples.length) {
      bars.push(0);
      continue;
    }
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += Math.abs(samples[j]!);
    }
    bars.push(Math.round((sum / (end - start)) * 100) / 100);
  }

  return { barCount: WAVEFORM_BAR_COUNT, bars };
}
