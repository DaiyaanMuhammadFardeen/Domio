/**
 * Bench report serialisation for `crdt-bench`.
 *
 * Output format is a stable JSON document with sorted keys (so two
 * equivalent bench runs byte-compare after `JSON.stringify`). The
 * `schemaVersion` field gates future format changes.
 */

import * as os from 'node:os';
import type { BenchResult } from './harness.js';

export const REPORT_SCHEMA_VERSION = 1;

export interface BenchReport {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly host: {
    readonly platform: string;
    readonly arch: string;
    readonly nodeVersion: string;
    readonly cpus: number;
  };
  readonly scenario: string;
  readonly editors: number;
  readonly totalEdits: number;
  readonly convergenceMs: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
    readonly mean: number;
  };
  readonly memoryBytes: number;
  readonly durationMs: number;
  readonly aborted: boolean;
}

/** Render a `BenchResult` into a stable `BenchReport`. */
export function reportBench(result: BenchResult): BenchReport {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
    },
    scenario: result.scenario,
    editors: result.editors,
    totalEdits: result.totalEdits,
    convergenceMs: result.convergenceMs,
    memoryBytes: result.memoryBytes,
    durationMs: result.durationMs,
    aborted: result.aborted,
  };
}

/**
 * Serialize a report to a JSON string with sorted keys at every depth.
 * Two equivalent bench runs (modulo timestamps) produce identical bytes
 * after the `generatedAt` field is masked.
 */
export function serializeReport(report: BenchReport): string {
  return JSON.stringify(report, Object.keys(report).sort(), 2) + '\n';
}

/** Mask the `generatedAt` field for byte-stable diffs. */
export function maskTimestamp(report: BenchReport): BenchReport {
  return { ...report, generatedAt: '<masked>' };
}
