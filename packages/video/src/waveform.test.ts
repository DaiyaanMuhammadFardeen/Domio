import { describe, it, expect } from 'vitest';
import { computeWaveform } from './waveform.js';

describe('computeWaveform', () => {
  it('returns zero bars for empty input', () => {
    const result = computeWaveform(new Float32Array(0), 48);
    expect(result.bars).toHaveLength(48);
    result.bars.forEach((bar) => {
      expect(bar.min).toBe(0);
      expect(bar.max).toBe(0);
    });
    expect(result.samplesPerBucket).toBe(0);
  });

  it('throws for non-positive barCount', () => {
    expect(() => computeWaveform(new Float32Array(100), 0)).toThrow(
      'barCount must be greater than 0',
    );
    expect(() => computeWaveform(new Float32Array(100), -1)).toThrow(
      'barCount must be greater than 0',
    );
  });

  it('computes bars for simple even division', () => {
    // 10 samples, 5 bars → 2 samples per bar
    const samples = new Float32Array([0.1, 0.3, 0.5, 0.7, -0.2, 0.4, 0.6, 0.8, -0.1, 0.2]);
    const result = computeWaveform(samples, 5);
    expect(result.bars).toHaveLength(5);
    expect(result.samplesPerBucket).toBe(2);

    // Bar 0: samples[0]=0.1, samples[1]=0.3 → min≈0.1, max≈0.3
    expect(result.bars[0]!.min).toBeCloseTo(0.1, 5);
    expect(result.bars[0]!.max).toBeCloseTo(0.3, 5);
    // Bar 1: samples[2]=0.5, samples[3]=0.7
    expect(result.bars[1]!.min).toBeCloseTo(0.5, 5);
    expect(result.bars[1]!.max).toBeCloseTo(0.7, 5);
    // Bar 2: samples[4]=-0.2, samples[5]=0.4
    expect(result.bars[2]!.min).toBeCloseTo(-0.2, 5);
    expect(result.bars[2]!.max).toBeCloseTo(0.4, 5);
  });

  it('handles last bar with remainder samples', () => {
    // 10 samples, 3 bars → 3 samples per bar, last bar gets 4
    const samples = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = computeWaveform(samples, 3);
    expect(result.bars).toHaveLength(3);
    expect(result.samplesPerBucket).toBe(3);

    expect(result.bars[0]).toEqual({ min: 1, max: 3 });
    expect(result.bars[1]).toEqual({ min: 4, max: 6 });
    expect(result.bars[2]).toEqual({ min: 7, max: 10 });
  });

  it('handles barCount > sample count — all samples land in last bar', () => {
    const samples = new Float32Array([0.5, -0.5]);
    const result = computeWaveform(samples, 5);
    expect(result.bars).toHaveLength(5);
    // With 2 samples and 5 bars: samplesPerBucket = floor(2/5) = 0
    // Bars 0-3: start == end → empty bucket → min=0, max=0
    // Bar 4 (last): gets all samples → min=-0.5, max=0.5
    expect(result.bars[0]).toEqual({ min: 0, max: 0 });
    expect(result.bars[1]).toEqual({ min: 0, max: 0 });
    expect(result.bars[2]).toEqual({ min: 0, max: 0 });
    expect(result.bars[3]).toEqual({ min: 0, max: 0 });
    expect(result.bars[4]).toEqual({ min: -0.5, max: 0.5 });
  });

  it('is deterministic', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const r1 = computeWaveform(samples, 3);
    const r2 = computeWaveform(samples, 3);
    expect(r1.bars).toEqual(r2.bars);
    expect(r1.samplesPerBucket).toBe(r2.samplesPerBucket);
  });

  it('defaults to 48 bars', () => {
    const samples = new Float32Array(480);
    for (let i = 0; i < 480; i++) samples[i] = i / 480;
    const result = computeWaveform(samples);
    expect(result.bars).toHaveLength(48);
    expect(result.samplesPerBucket).toBe(10);
  });

  it('handles single sample', () => {
    const samples = new Float32Array([0.42]);
    const result = computeWaveform(samples, 1);
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]!.min).toBeCloseTo(0.42, 5);
    expect(result.bars[0]!.max).toBeCloseTo(0.42, 5);
  });

  it('handles negative values correctly', () => {
    const samples = new Float32Array([-0.8, -0.2, -0.5, -0.1]);
    const result = computeWaveform(samples, 2);
    expect(result.bars[0]!.min).toBeCloseTo(-0.8, 5);
    expect(result.bars[0]!.max).toBeCloseTo(-0.2, 5);
    expect(result.bars[1]!.min).toBeCloseTo(-0.5, 5);
    expect(result.bars[1]!.max).toBeCloseTo(-0.1, 5);
  });
});
