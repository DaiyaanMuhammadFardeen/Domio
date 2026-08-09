/**
 * @domio/perf-harness — report tests.
 */

import { describe, it, expect } from 'vitest';
import { reportFrameStats, reportReplay, serializeReport } from './report.js';
import type { ReplayResult } from './replay.js';

describe('reportFrameStats', () => {
  it('produces a stable schema', () => {
    const r = reportFrameStats('unit-test', {
      frames: 60,
      durationMs: 1000,
      fps: 60,
      p50Ms: 16,
      p95Ms: 18,
      p99Ms: 22,
      maxMs: 25,
      minMs: 14,
      jitter: 0.1,
      aborted: false,
    });
    expect(r.schemaVersion).toBe(1);
    expect(r.scenario).toBe('unit-test');
    expect(r.result).toMatchObject({ fps: 60, frames: 60 });
  });

  it('serializes deterministically (sorted keys)', () => {
    const r = reportFrameStats('unit-test', {
      frames: 10,
      durationMs: 167,
      fps: 60,
      p50Ms: 16,
      p95Ms: 17,
      p99Ms: 18,
      maxMs: 19,
      minMs: 14,
      jitter: 0.05,
      aborted: false,
    });
    const s = serializeReport(r);
    // Top-level keys appear in alphabetical order in the second line.
    const topLevelKeysLine = s.split('\n')[1]!;
    expect(topLevelKeysLine).toMatch(/^\s*"host":|"result":|"scenario":|"schemaVersion":|"timestamp":/);
    // Verify "host" comes before "result" which comes before "scenario".
    const hostIdx = s.indexOf('"host"');
    const resultIdx = s.indexOf('"result"');
    const scenarioIdx = s.indexOf('"scenario"');
    expect(hostIdx).toBeGreaterThan(-1);
    expect(hostIdx).toBeLessThan(resultIdx);
    expect(resultIdx).toBeLessThan(scenarioIdx);
  });
});

describe('reportReplay', () => {
  it('summarises a replay result', () => {
    const r = reportReplay('presenter-2h', {
      scenario: { id: 'presenter-2h', durationMs: 1000, minFps: 30 },
      startedAtMs: 0,
      endedAtMs: 1000,
      actualDurationMs: 1000,
      frames: 60,
      fps: 60,
      p50Ms: 16,
      p95Ms: 18,
      p99Ms: 22,
      memoryGrowthBytes: 1024,
      aborted: false,
    } satisfies ReplayResult);
    expect(r.scenario).toBe('presenter-2h');
    expect(r.result).toMatchObject({ frames: 60, aborted: false });
  });
});