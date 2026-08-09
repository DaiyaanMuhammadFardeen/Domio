import { describe, it, expect } from 'vitest';
import {
  reportBench,
  serializeReport,
  maskTimestamp,
  REPORT_SCHEMA_VERSION,
} from './report.js';
import type { BenchResult } from './harness.js';

const SAMPLE_RESULT: BenchResult = {
  editors: 100,
  totalEdits: 4000,
  scenario: 'mixed',
  convergenceMs: { p50: 2, p95: 8, p99: 15, max: 22, mean: 3.5 },
  memoryBytes: 8_388_608,
  durationMs: 1234,
  aborted: false,
};

describe('reportBench', () => {
  it('maps BenchResult to BenchReport', () => {
    const report = reportBench(SAMPLE_RESULT);
    expect(report.scenario).toBe('mixed');
    expect(report.editors).toBe(100);
    expect(report.convergenceMs.p95).toBe(8);
  });

  it('includes schemaVersion', () => {
    const report = reportBench(SAMPLE_RESULT);
    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
  });

  it('captures host info', () => {
    const report = reportBench(SAMPLE_RESULT);
    expect(report.host.platform).toBe(process.platform);
    expect(report.host.arch).toBe(process.arch);
    expect(report.host.nodeVersion).toBe(process.version);
    expect(report.host.cpus).toBeGreaterThan(0);
  });

  it('generates ISO timestamp', () => {
    const report = reportBench(SAMPLE_RESULT);
    expect(new Date(report.generatedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('serializeReport', () => {
  it('produces JSON with sorted top-level keys', () => {
    const report = reportBench(SAMPLE_RESULT);
    const json = serializeReport(report);
    // Top-level fields in alpha order
    const order = [
      'aborted',
      'convergenceMs',
      'durationMs',
      'editors',
      'generatedAt',
      'host',
      'memoryBytes',
      'scenario',
      'schemaVersion',
      'totalEdits',
    ];
    let pos = -1;
    for (const k of order) {
      const idx = json.indexOf(`"${k}":`);
      expect(idx, `key ${k} not found`).toBeGreaterThan(-1);
      expect(idx, `key ${k} out of order`).toBeGreaterThan(pos);
      pos = idx;
    }
  });

  it('serialises twice identically when timestamps masked', () => {
    const a = serializeReport(maskTimestamp(reportBench(SAMPLE_RESULT)));
    // Sleep 1ms to ensure different generatedAt
    const start = Date.now();
    while (Date.now() === start) {
      // spin briefly
    }
    const b = serializeReport(maskTimestamp(reportBench(SAMPLE_RESULT)));
    expect(a).toBe(b);
  });
});

describe('maskTimestamp', () => {
  it('replaces generatedAt with sentinel', () => {
    const report = reportBench(SAMPLE_RESULT);
    const masked = maskTimestamp(report);
    expect(masked.generatedAt).toBe('<masked>');
    expect(masked.scenario).toBe(report.scenario);
  });
});