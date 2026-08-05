import { describe, it, expect } from 'vitest';
import { getSegmentInfo, clipTrimToSource } from './playback.js';

describe('getSegmentInfo', () => {
  it('returns zero-state for zero duration', () => {
    const info = getSegmentInfo(0, 1000, 0);
    expect(info).toEqual({
      segmentIndex: 0,
      segmentStartMs: 0,
      segmentEndMs: 0,
      effectivePlayheadMs: 0,
      totalSegments: 0,
    });
  });

  it('throws for non-positive segment duration', () => {
    expect(() => getSegmentInfo(10000, 0, 0)).toThrow('segmentDurationMs must be greater than 0');
    expect(() => getSegmentInfo(10000, -1, 0)).toThrow('segmentDurationMs must be greater than 0');
  });

  it('maps playhead 0 to first segment', () => {
    const info = getSegmentInfo(10000, 2000, 0);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(0);
    expect(info.segmentEndMs).toBe(2000);
    expect(info.effectivePlayheadMs).toBe(0);
    expect(info.totalSegments).toBe(5);
  });

  it('maps playhead at segment boundary to next segment start', () => {
    const info = getSegmentInfo(10000, 2000, 2000);
    expect(info.segmentIndex).toBe(1);
    expect(info.segmentStartMs).toBe(2000);
    expect(info.segmentEndMs).toBe(4000);
  });

  it('maps playhead mid-segment to correct segment', () => {
    const info = getSegmentInfo(10000, 2000, 3500);
    expect(info.segmentIndex).toBe(1);
    expect(info.segmentStartMs).toBe(2000);
    expect(info.segmentEndMs).toBe(4000);
    expect(info.effectivePlayheadMs).toBe(3500);
  });

  it('clamps playhead beyond end to last segment', () => {
    const info = getSegmentInfo(10000, 2000, 15000);
    expect(info.segmentIndex).toBe(4);
    expect(info.segmentStartMs).toBe(8000);
    expect(info.segmentEndMs).toBe(10000);
    expect(info.effectivePlayheadMs).toBe(10000);
  });

  it('clamps negative playhead to 0', () => {
    const info = getSegmentInfo(10000, 2000, -500);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(0);
    expect(info.effectivePlayheadMs).toBe(0);
  });

  it('handles segment duration larger than total duration', () => {
    const info = getSegmentInfo(5000, 10000, 0);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(0);
    expect(info.segmentEndMs).toBe(5000);
    expect(info.totalSegments).toBe(1);
  });

  it('computes totalSegments correctly with non-even division', () => {
    const info = getSegmentInfo(10000, 3000, 0);
    expect(info.totalSegments).toBe(4); // ceil(10000/3000) = 4
  });
});

describe('getSegmentInfo with trim', () => {
  it('maps playhead 0 to trim.inMs', () => {
    const info = getSegmentInfo(10000, 2000, 0, { inMs: 3000, outMs: 8000 });
    expect(info.effectivePlayheadMs).toBe(0);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(3000);
    expect(info.segmentEndMs).toBe(5000);
    expect(info.totalSegments).toBe(3); // ceil(5000/2000)
  });

  it('maps playhead within trimmed region', () => {
    const info = getSegmentInfo(10000, 2000, 1000, { inMs: 3000, outMs: 8000 });
    expect(info.effectivePlayheadMs).toBe(1000);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(3000);
    expect(info.segmentEndMs).toBe(5000);
  });

  it('maps playhead past trim boundary to correct segment', () => {
    const info = getSegmentInfo(10000, 2000, 3000, { inMs: 3000, outMs: 8000 });
    expect(info.effectivePlayheadMs).toBe(3000);
    expect(info.segmentIndex).toBe(1);
    expect(info.segmentStartMs).toBe(5000);
    expect(info.segmentEndMs).toBe(7000);
  });

  it('clamps playhead beyond trim.outMs', () => {
    const info = getSegmentInfo(10000, 2000, 6000, { inMs: 3000, outMs: 8000 });
    expect(info.effectivePlayheadMs).toBe(5000);
    expect(info.segmentIndex).toBe(2);
    expect(info.segmentStartMs).toBe(7000);
    expect(info.segmentEndMs).toBe(8000);
  });

  it('handles trim at start of video', () => {
    const info = getSegmentInfo(10000, 2000, 0, { inMs: 0, outMs: 5000 });
    expect(info.effectivePlayheadMs).toBe(0);
    expect(info.segmentIndex).toBe(0);
    expect(info.totalSegments).toBe(3); // ceil(5000/2000)
  });

  it('handles trim at end of video', () => {
    const info = getSegmentInfo(10000, 2000, 0, { inMs: 8000, outMs: 10000 });
    expect(info.effectivePlayheadMs).toBe(0);
    expect(info.segmentIndex).toBe(0);
    expect(info.segmentStartMs).toBe(8000);
    expect(info.segmentEndMs).toBe(10000);
    expect(info.totalSegments).toBe(1);
  });
});

describe('clipTrimToSource', () => {
  it('returns same trim if within bounds', () => {
    const result = clipTrimToSource(10000, { inMs: 2000, outMs: 8000 });
    expect(result).toEqual({ inMs: 2000, outMs: 8000 });
  });

  it('clamps trim to source end', () => {
    const result = clipTrimToSource(10000, { inMs: 5000, outMs: 15000 });
    expect(result).toEqual({ inMs: 5000, outMs: 10000 });
  });

  it('clamps negative inMs to 0', () => {
    const result = clipTrimToSource(10000, { inMs: -1000, outMs: 5000 });
    expect(result).toEqual({ inMs: 0, outMs: 5000 });
  });

  it('returns undefined if trim is entirely before source', () => {
    const result = clipTrimToSource(10000, { inMs: -5000, outMs: -1000 });
    expect(result).toBeUndefined();
  });

  it('returns undefined if trim is entirely after source', () => {
    const result = clipTrimToSource(10000, { inMs: 15000, outMs: 20000 });
    expect(result).toBeUndefined();
  });

  it('returns undefined if inMs >= outMs after clamping', () => {
    const result = clipTrimToSource(10000, { inMs: 10000, outMs: 10000 });
    expect(result).toBeUndefined();
  });

  it('handles trim starting before source and ending after', () => {
    const result = clipTrimToSource(10000, { inMs: -2000, outMs: 15000 });
    expect(result).toEqual({ inMs: 0, outMs: 10000 });
  });
});
