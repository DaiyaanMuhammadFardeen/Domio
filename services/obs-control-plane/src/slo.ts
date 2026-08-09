/**
 * @domio/obs-control-plane — SLO catalogue parser.
 *
 * Parses `docs/slos/catalogue.md` into typed `SloEntry` records. The
 * parser is permissive about Markdown formatting — it ignores any line
 * that doesn't look like a pipe-separated table row, and skips the
 * header / separator rows automatically.
 */

import type { SloEntry, SloKind, ServiceTier } from './types.js';
import { SloParseError } from './types.js';

/** Parse the catalogue markdown into typed SLO entries. */
export function parseSloCatalogue(markdown: string): SloEntry[] {
  const entries: SloEntry[] = [];
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (trimmed.startsWith('|---')) continue; // separator row
    if (trimmed.startsWith('| Service')) continue; // header row

    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 7) continue;

    try {
      entries.push(parseRow(cells));
    } catch (e) {
      if (e instanceof SloParseError) throw e;
      throw new SloParseError(`Failed to parse row: ${(e as Error).message}`, i + 1);
    }
  }

  return entries;
}

/** Parse a single row's cells into an `SloEntry`. */
function parseRow(cells: string[]): SloEntry {
  const [serviceCell, sloCell, targetCell, windowCell, tierCell, ownerCell, alertCell] =
    cells as [string, string, string, string, string, string, string];

  const service = stripBackticks(serviceCell);
  const slo = sloCell;
  const target = targetCell;
  const targetProbability = parseTargetProbability(target, slo);
  const window = windowCell;
  const windowSeconds = parseWindow(window);
  const tier = parseTier(tierCell);
  const owner = ownerCell;
  const alertPrefix = stripBackticks(alertCell);
  const kind = inferKind(slo);

  const base = {
    service,
    slo,
    target,
    targetProbability,
    window,
    windowSeconds,
    tier,
    owner,
    alertPrefix,
    kind,
  };

  if (kind === 'latency') {
    return { ...base, latencyThresholdMs: parseLatencyThreshold(target) };
  }
  return base;
}

/** Strip backticks and trailing italic annotations like `*(packages)*` from a Markdown cell. */
function stripBackticks(s: string): string {
  return s.replace(/`/g, '').replace(/\s*\*\([^)]*\)\*\s*$/, '').trim();
}

/** Parse a target string like `99.9%` or `< 200 ms` into a probability. */
function parseTargetProbability(target: string, slo: string): number {
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(target.trim());
  if (pct) return Number(pct[1]) / 100;

  // Latency target like `< 200 ms` or `< 3 s`. SLI probability is the
  // fraction of requests expected to be within threshold. We don't know
  // that without baseline data, so we approximate using a fixed default
  // of 0.95. Real numbers must be tuned post-launch.
  if (/\b\d+(?:\.\d+)?\s*(?:ms|s)\b/.test(target)) return 0.95;

  throw new SloParseError(`Cannot parse target "${target}" for SLO "${slo}"`);
}

/** Parse a window string like `30d`, `7d`, `24h` into seconds. */
function parseWindow(window: string): number {
  const m = /^(\d+)\s*([smhdw])$/.exec(window.trim());
  if (!m) throw new SloParseError(`Cannot parse window "${window}"`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86_400;
    case 'w': return n * 604_800;
    default: throw new SloParseError(`Unknown window unit "${m[2]}"`);
  }
}

/** Parse a tier cell. */
function parseTier(cell: string): ServiceTier {
  const c = cell.trim();
  if (c === 'tier-1') return 'tier-1';
  if (c === 'tier-2') return 'tier-2';
  if (c === 'tier-3') return 'tier-3';
  throw new SloParseError(`Unknown tier "${c}"`);
}

/** Infer the SLO kind from its short name. */
function inferKind(slo: string): SloKind {
  if (slo.startsWith('avail-')) return 'availability';
  if (slo.startsWith('lat-')) return 'latency';
  if (slo.startsWith('qual-')) return 'quality';
  throw new SloParseError(`Unknown SLO kind from name "${slo}"`);
}

/** Parse a latency threshold like `< 200 ms` into a number of ms. */
function parseLatencyThreshold(target: string): number {
  const m = /<\s*(\d+(?:\.\d+)?)\s*(ms|s)\b/.exec(target.trim());
  if (!m) throw new SloParseError(`Cannot parse latency threshold "${target}"`);
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : n;
}
