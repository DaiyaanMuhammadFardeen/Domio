import { describe, it, expect } from 'vitest';
import { parseVTT, generateVTT } from './captions.js';

describe('parseVTT', () => {
  it('parses a minimal VTT with WEBVTT header', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.500
Hello, world!

00:00:05.000 --> 00:00:07.000
Second cue`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.cues[0]).toEqual({
      startMs: 1000,
      endMs: 3500,
      text: 'Hello, world!',
    });
    expect(result.cues[1]).toEqual({
      startMs: 5000,
      endMs: 7000,
      text: 'Second cue',
    });
  });

  it('parses VTT without WEBVTT header', () => {
    const vtt = `00:00:01.000 --> 00:00:03.500
No header cue`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.text).toBe('No header cue');
  });

  it('parses multi-line cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Line one
Line two
Line three`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.text).toBe('Line one\nLine two\nLine three');
  });

  it('handles comma as millisecond separator', () => {
    const vtt = `WEBVTT

00:00:01,500 --> 00:00:03,000
Comma separated`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.startMs).toBe(1500);
    expect(result.cues[0]!.endMs).toBe(3000);
  });

  it('handles hours in timestamps', () => {
    const vtt = `WEBVTT

01:30:00.000 --> 02:00:00.000
One hour thirty`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.startMs).toBe(5_400_000);
    expect(result.cues[0]!.endMs).toBe(7_200_000);
  });

  it('skips NOTE blocks', () => {
    const vtt = `WEBVTT

NOTE
This is a comment

00:00:01.000 --> 00:00:03.000
After note`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.text).toBe('After note');
  });

  it('warns on malformed timestamp line', () => {
    const vtt = `WEBVTT

not a timestamp
00:00:01.000 --> 00:00:03.000
Valid cue`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.line).toBe(3);
    expect(result.warnings[0]!.message).toContain('Expected timestamp');
  });

  it('warns on cue with start >= end', () => {
    const vtt = `WEBVTT

00:00:05.000 --> 00:00:03.000

00:00:07.000 --> 00:00:09.000
Valid`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]!.text).toBe('Valid');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('Start time');
  });

  it('warns on empty cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000

00:00:05.000 --> 00:00:07.000
Valid`;
    const result = parseVTT(vtt);
    expect(result.cues).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('no text content');
  });

  it('handles empty input', () => {
    const result = parseVTT('');
    expect(result.cues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('handles VTT with only header and no cues', () => {
    const result = parseVTT('WEBVTT\n\n');
    expect(result.cues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('generateVTT', () => {
  it('generates valid VTT from cues', () => {
    const cues = [
      { startMs: 1000, endMs: 3500, text: 'Hello, world!' },
      { startMs: 5000, endMs: 7000, text: 'Second cue' },
    ];
    const vtt = generateVTT(cues);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.500');
    expect(vtt).toContain('Hello, world!');
    expect(vtt).toContain('00:00:05.000 --> 00:00:07.000');
    expect(vtt).toContain('Second cue');
  });

  it('generates empty VTT for empty cue array', () => {
    const vtt = generateVTT([]);
    expect(vtt).toBe('WEBVTT\n');
  });

  it('roundtrips parse → generate → parse', () => {
    const original = `WEBVTT

00:00:01.000 --> 00:00:03.500
Hello, world!

00:00:05.000 --> 00:00:07.000
Second cue`;
    const parsed1 = parseVTT(original);
    const generated = generateVTT(parsed1.cues);
    const parsed2 = parseVTT(generated);
    expect(parsed2.cues).toEqual(parsed1.cues);
    expect(parsed2.warnings).toHaveLength(0);
  });

  it('formats timestamps correctly', () => {
    const cues = [
      { startMs: 0, endMs: 1000, text: 'Start' },
      { startMs: 3_661_000, endMs: 7_200_000, text: 'Long' },
    ];
    const vtt = generateVTT(cues);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.000');
    expect(vtt).toContain('01:01:01.000 --> 02:00:00.000');
  });
});
