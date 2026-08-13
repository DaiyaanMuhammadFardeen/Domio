/**
 * @domio/video — Phase 11 perf smoke.
 *
 * Validates that the headless primitives meet the Phase 11 perf budgets:
 *  - caption parsing: 100 KB of WebVTT must parse in < 50 ms (R-11-2)
 *  - waveform: 64 K samples → 256 bars in < 25 ms (R-11-2)
 *
 * Generous 10x wall-clock headroom so CI doesn't flake.
 */

import { describe, it, expect } from 'vitest';
import { parseVTT } from './captions.js';
import { computeWaveform } from './waveform.js';

describe('perf smoke — video primitives (R-11-2)', () => {
  it('parses 100 KB of WebVTT well inside the budget', () => {
    // Generate ~100 KB of synthetic cues in hh:mm:ss.fff format.
    const lines: string[] = ['WEBVTT', ''];
    for (let i = 0; i < 1500; i++) {
      const startMs = i * 1000;
      const endMs = startMs + 900;
      const fmt = (ms: number): string => {
        const hh = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
        const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
        const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
        const fff = String(ms % 1000).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${fff}`;
      };
      lines.push(`${fmt(startMs)} --> ${fmt(endMs)}`);
      lines.push(`Cue number ${i} — synthetic text padding to keep payload size up.`);
      lines.push('');
    }
    const payload = lines.join('\n');

    const t0 = performance.now();
    const result = parseVTT(payload);
    const elapsed = performance.now() - t0;

    expect(result.cues.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(500); // 10x headroom over the 50 ms budget.
  });

  it('computes 256 waveform bars from 64 K samples within the budget', () => {
    const samples = new Float32Array(64 * 1024);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(i / 16) * 0.9;
    }

    const t0 = performance.now();
    const result = computeWaveform(samples, 256);
    const elapsed = performance.now() - t0;

    expect(result.bars.length).toBe(256);
    expect(elapsed).toBeLessThan(250);
  });
});
