import { describe, it, expect } from 'vitest';
import { analyzeContrast } from './contrast.js';

describe('analyzeContrast', () => {
  it('returns defaults for empty array', () => {
    const result = analyzeContrast(new Float32Array(0), 0);
    expect(result.meanLuma).toBe(0);
    expect(result.rmsContrast).toBe(0);
    expect(result.labelColor).toBe('dark');
    expect(result.shadow).toBe(false);
    expect(result.scrim).toBe('rgba(0,0,0,0)');
  });

  it('computes mean luma for uniform bright frame', () => {
    // All pixels at 0.8 luminance
    const luma = new Float32Array(100).fill(0.8);
    const result = analyzeContrast(luma, 100);
    expect(result.meanLuma).toBeCloseTo(0.8, 5);
    expect(result.rmsContrast).toBeCloseTo(0, 5);
    expect(result.labelColor).toBe('dark');
    expect(result.shadow).toBe(false);
    expect(result.scrim).toBe('rgba(0,0,0,0)');
  });

  it('computes mean luma for uniform dark frame', () => {
    const luma = new Float32Array(100).fill(0.2);
    const result = analyzeContrast(luma, 100);
    expect(result.meanLuma).toBeCloseTo(0.2, 5);
    // meanLuma 0.2 <= 0.6, rmsContrast = 0 < 0.15 → low contrast
    expect(result.labelColor).toBe('light');
    expect(result.shadow).toBe(true);
    expect(result.scrim).toBe('rgba(0,0,0,0.55)');
  });

  it('computes RMS contrast for high-contrast frame', () => {
    // Half pixels at 0, half at 1 → mean = 0.5, RMS = 0.5
    const luma = new Float32Array(100);
    for (let i = 0; i < 50; i++) luma[i] = 0;
    for (let i = 50; i < 100; i++) luma[i] = 1;
    const result = analyzeContrast(luma, 100);
    expect(result.meanLuma).toBeCloseTo(0.5, 5);
    expect(result.rmsContrast).toBeCloseTo(0.5, 5);
    // meanLuma 0.5 <= 0.6, rmsContrast 0.5 >= 0.15 → dark bg, sufficient contrast
    expect(result.labelColor).toBe('light');
    expect(result.shadow).toBe(true);
  });

  it('computes RMS contrast for low-contrast dark frame', () => {
    // All pixels around 0.3 with small variation → mean ~0.3, RMS ~0
    const luma = new Float32Array(100).fill(0.3);
    const result = analyzeContrast(luma, 100);
    expect(result.meanLuma).toBeCloseTo(0.3, 5);
    expect(result.rmsContrast).toBeCloseTo(0, 5);
    // meanLuma 0.3 <= 0.6, rmsContrast ~0 < 0.15 → low contrast
    expect(result.labelColor).toBe('light');
    expect(result.scrim).toBe('rgba(0,0,0,0.55)');
    expect(result.shadow).toBe(true);
  });

  it('marks shouldOffloadToWorker true when pixelCount > 1_000_000', () => {
    const luma = new Float32Array(100).fill(0.5);
    const result = analyzeContrast(luma, 2_000_000);
    expect(result.shouldOffloadToWorker).toBe(true);
  });

  it('marks shouldOffloadToWorker false when pixelCount <= 1_000_000', () => {
    const luma = new Float32Array(100).fill(0.5);
    const result = analyzeContrast(luma, 1_000_000);
    expect(result.shouldOffloadToWorker).toBe(false);
  });

  it('is deterministic for same input', () => {
    const luma = new Float32Array([0.1, 0.3, 0.5, 0.7, 0.9]);
    const r1 = analyzeContrast(luma, 5);
    const r2 = analyzeContrast(luma, 5);
    expect(r1.meanLuma).toBe(r2.meanLuma);
    expect(r1.rmsContrast).toBe(r2.rmsContrast);
    expect(r1.labelColor).toBe(r2.labelColor);
    expect(r1.scrim).toBe(r2.scrim);
    expect(r1.shadow).toBe(r2.shadow);
  });

  it('1080p frame (1920*1080 = 2073600) → offload', () => {
    const luma = new Float32Array(100).fill(0.5);
    const result = analyzeContrast(luma, 1920 * 1080);
    expect(result.shouldOffloadToWorker).toBe(true);
  });

  it('720p frame (1280*720 = 921600) → inline', () => {
    const luma = new Float32Array(100).fill(0.5);
    const result = analyzeContrast(luma, 1280 * 720);
    expect(result.shouldOffloadToWorker).toBe(false);
  });
});
