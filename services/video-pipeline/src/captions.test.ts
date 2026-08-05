/**
 * Video pipeline — captions tests (Phase 11).
 *
 * Covers:
 * - formatVttTimestamp: zero, seconds, minutes, hours, milliseconds
 * - generateVttCues: single cue, multiple cues, generator protocol
 * - generateWebVTT: header presence, cue content, trailing newline
 * - extractWaveformMetadata: empty samples, recorded fixture, bar count, values
 * - SAMPLE_TRANSCRIPT and SAMPLE_WAVEFORM_SAMPLES fixture integrity
 */

import { describe, it, expect } from 'vitest';
import {
  formatVttTimestamp,
  generateVttCues,
  generateWebVTT,
  extractWaveformMetadata,
  SAMPLE_TRANSCRIPT,
  SAMPLE_WAVEFORM_SAMPLES,
  WAVEFORM_BAR_COUNT,
} from './captions.js';

// ---------------------------------------------------------------------------
// formatVttTimestamp
// ---------------------------------------------------------------------------

describe('formatVttTimestamp', () => {
  it('formats zero as 00:00:00.000', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000');
  });

  it('formats 1000ms as 00:00:01.000', () => {
    expect(formatVttTimestamp(1000)).toBe('00:00:01.000');
  });

  it('formats 3500ms as 00:00:03.500', () => {
    expect(formatVttTimestamp(3500)).toBe('00:00:03.500');
  });

  it('formats 61500ms as 00:01:01.500', () => {
    expect(formatVttTimestamp(61500)).toBe('00:01:01.500');
  });

  it('formats 3661123ms as 01:01:01.123', () => {
    expect(formatVttTimestamp(3661123)).toBe('01:01:01.123');
  });

  it('pads single-digit values', () => {
    expect(formatVttTimestamp(5000)).toBe('00:00:05.000');
    expect(formatVttTimestamp(60000)).toBe('00:01:00.000');
  });
});

// ---------------------------------------------------------------------------
// generateVttCues
// ---------------------------------------------------------------------------

describe('generateVttCues', () => {
  it('generates a single cue', () => {
    const lines = [{ startMs: 1000, endMs: 3500, text: 'Hello world' }];
    const cues = [...generateVttCues(lines)];
    expect(cues).toHaveLength(1);
    expect(cues[0]).toBe('00:00:01.000 --> 00:00:03.500\nHello world');
  });

  it('generates multiple cues', () => {
    const lines = [
      { startMs: 0, endMs: 1000, text: 'First' },
      { startMs: 1500, endMs: 2500, text: 'Second' },
    ];
    const cues = [...generateVttCues(lines)];
    expect(cues).toHaveLength(2);
    expect(cues[0]).toContain('First');
    expect(cues[1]).toContain('Second');
  });

  it('is a proper generator (lazy evaluation)', () => {
    const gen = generateVttCues([
      { startMs: 0, endMs: 500, text: 'A' },
      { startMs: 600, endMs: 1000, text: 'B' },
    ]);
    const first = gen.next();
    expect(first.done).toBe(false);
    expect(first.value).toContain('A');
    const second = gen.next();
    expect(second.done).toBe(false);
    expect(second.value).toContain('B');
    const third = gen.next();
    expect(third.done).toBe(true);
  });

  it('yields empty for empty input', () => {
    const cues = [...generateVttCues([])];
    expect(cues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateWebVTT
// ---------------------------------------------------------------------------

describe('generateWebVTT', () => {
  it('starts with WEBVTT header', () => {
    const vtt = generateWebVTT([]);
    expect(vtt).toMatch(/^WEBVTT\n\n/);
  });

  it('contains cue text', () => {
    const vtt = generateWebVTT([{ startMs: 1000, endMs: 3500, text: 'Test cue' }]);
    expect(vtt).toContain('Test cue');
  });

  it('formats timestamps in cues', () => {
    const vtt = generateWebVTT([{ startMs: 1000, endMs: 3500, text: 'Hello' }]);
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.500');
  });

  it('produces multi-cue document', () => {
    const lines = [
      { startMs: 0, endMs: 1000, text: 'Line 1' },
      { startMs: 2000, endMs: 3000, text: 'Line 2' },
    ];
    const vtt = generateWebVTT(lines);
    expect(vtt).toContain('Line 1');
    expect(vtt).toContain('Line 2');
    // Cues separated by double newline
    expect(vtt).toContain('Line 1\n\n00:00:02.000');
  });

  it('ends with trailing newline', () => {
    const vtt = generateWebVTT([{ startMs: 0, endMs: 500, text: 'End' }]);
    expect(vtt.endsWith('\n')).toBe(true);
  });

  it('works with SAMPLE_TRANSCRIPT fixture', () => {
    const vtt = generateWebVTT(SAMPLE_TRANSCRIPT);
    expect(vtt).toMatch(/^WEBVTT\n\n/);
    expect(vtt).toContain('Welcome to the domio platform.');
    expect(vtt).toContain('Thank you for watching.');
    // 8 cues in the fixture
    const cueCount = vtt.split('-->').length - 1;
    expect(cueCount).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// extractWaveformMetadata
// ---------------------------------------------------------------------------

describe('extractWaveformMetadata', () => {
  it('returns correct barCount', () => {
    const result = extractWaveformMetadata(SAMPLE_WAVEFORM_SAMPLES);
    expect(result.barCount).toBe(WAVEFORM_BAR_COUNT);
    expect(result.barCount).toBe(48);
  });

  it('returns 48 bars', () => {
    const result = extractWaveformMetadata(SAMPLE_WAVEFORM_SAMPLES);
    expect(result.bars).toHaveLength(48);
  });

  it('bar values are between 0 and 1', () => {
    const result = extractWaveformMetadata(SAMPLE_WAVEFORM_SAMPLES);
    for (const bar of result.bars) {
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThanOrEqual(1);
    }
  });

  it('bar values are numbers (not NaN)', () => {
    const result = extractWaveformMetadata(SAMPLE_WAVEFORM_SAMPLES);
    for (const bar of result.bars) {
      expect(Number.isFinite(bar)).toBe(true);
    }
  });

  it('returns zero bars for empty samples', () => {
    const result = extractWaveformMetadata([]);
    expect(result.barCount).toBe(48);
    expect(result.bars).toHaveLength(48);
    for (const bar of result.bars) {
      expect(bar).toBe(0);
    }
  });

  it('handles single sample', () => {
    const result = extractWaveformMetadata([0.5]);
    expect(result.bars).toHaveLength(48);
    // First bar should be 0.5, rest 0
    expect(result.bars[0]).toBe(0.5);
    for (let i = 1; i < 48; i++) {
      expect(result.bars[i]).toBe(0);
    }
  });

  it('handles more samples than bars (downsampling)', () => {
    const samples = new Array(480).fill(0).map((_, i) => i / 480);
    const result = extractWaveformMetadata(samples);
    expect(result.bars).toHaveLength(48);
    // All bars should be non-zero since we have enough data
    expect(result.bars[0]).toBeGreaterThan(0);
  });

  it('records non-zero values from fixture', () => {
    const result = extractWaveformMetadata(SAMPLE_WAVEFORM_SAMPLES);
    const nonZero = result.bars.filter((b) => b > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture integrity
// ---------------------------------------------------------------------------

describe('fixtures', () => {
  it('SAMPLE_TRANSCRIPT has 8 lines', () => {
    expect(SAMPLE_TRANSCRIPT).toHaveLength(8);
  });

  it('SAMPLE_TRANSCRIPT lines are in chronological order', () => {
    for (let i = 1; i < SAMPLE_TRANSCRIPT.length; i++) {
      expect(SAMPLE_TRANSCRIPT[i]!.startMs).toBeGreaterThanOrEqual(
        SAMPLE_TRANSCRIPT[i - 1]!.startMs,
      );
    }
  });

  it('SAMPLE_TRANSCRIPT fits within 30s budget', () => {
    const lastEnd = SAMPLE_TRANSCRIPT[SAMPLE_TRANSCRIPT.length - 1]!.endMs;
    expect(lastEnd).toBeLessThanOrEqual(30000);
  });

  it('SAMPLE_WAVEFORM_SAMPLES has exactly 48 entries', () => {
    expect(SAMPLE_WAVEFORM_SAMPLES).toHaveLength(48);
  });

  it('SAMPLE_WAVEFORM_SAMPLES values are in [0, 1]', () => {
    for (const v of SAMPLE_WAVEFORM_SAMPLES) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
