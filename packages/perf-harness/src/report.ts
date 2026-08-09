/**
 * @domio/perf-harness — report formatting.
 *
 * Produces a deterministic JSON report for a perf run. The format is
 * stable across runs so the regression detector can compare current vs
 * baseline byte-for-byte.
 */

import * as os from 'node:os';
import type { FrameStats } from './frame.js';
import type { ReplayResult } from './replay.js';

export interface PerfReport {
  readonly schemaVersion: 1;
  readonly scenario: string;
  readonly timestamp: string; // ISO-8601 UTC
  readonly git?: {
    readonly sha: string;
    readonly branch: string;
  };
  readonly host?: {
    readonly hostname: string;
    readonly cpuModel: string;
    readonly platform: NodeJS.Platform;
    readonly nodeVersion: string;
  };
  readonly result: FrameStats | ReplaySummary;
}

export interface ReplaySummary {
  readonly frames: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly memoryGrowthBytes: number;
  readonly aborted: boolean;
  readonly abortReason?: string;
}

/** Format a frame-stats result as a PerfReport. */
export function reportFrameStats(
  scenario: string,
  stats: FrameStats,
  opts: { sha?: string; branch?: string } = {},
): PerfReport {
  const git = opts.sha && opts.branch ? { sha: opts.sha, branch: opts.branch } : undefined;
  const host = detectHost();
  return {
    schemaVersion: 1,
    scenario,
    timestamp: new Date().toISOString(),
    ...(git ? { git } : {}),
    ...(host ? { host } : {}),
    result: stats,
  };
}

/** Format a replay result as a PerfReport. */
export function reportReplay(
  scenario: string,
  result: ReplayResult,
  opts: { sha?: string; branch?: string } = {},
): PerfReport {
  const git = opts.sha && opts.branch ? { sha: opts.sha, branch: opts.branch } : undefined;
  const host = detectHost();
  const replaySummary: ReplaySummary = {
    frames: result.frames,
    durationMs: result.actualDurationMs,
    fps: result.fps,
    p50Ms: result.p50Ms,
    p95Ms: result.p95Ms,
    p99Ms: result.p99Ms,
    memoryGrowthBytes: result.memoryGrowthBytes,
    aborted: result.aborted,
    ...(result.abortReason ? { abortReason: result.abortReason } : {}),
  };
  return {
    schemaVersion: 1,
    scenario,
    timestamp: new Date().toISOString(),
    ...(git ? { git } : {}),
    ...(host ? { host } : {}),
    result: replaySummary,
  };
}

/** Serialize a PerfReport as deterministic JSON (key-sorted). */
export function serializeReport(report: PerfReport): string {
  return JSON.stringify(sortKeys(report), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function detectHost(): PerfReport['host'] {
  try {
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? 'unknown';
    const hostname = os.hostname();
    return {
      hostname,
      cpuModel,
      platform: process.platform,
      nodeVersion: process.version,
    };
  } catch {
    return undefined;
  }
}
