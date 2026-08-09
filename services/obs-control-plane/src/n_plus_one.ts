/**
 * @domio/obs-control-plane — N+1 query detector.
 *
 * Phase 22-beta G1-8. Reads an OTel-JSON export (or any span trace log
 * with the same shape) and identifies spans whose child set exhibits
 * the N+1 query anti-pattern: a small number of distinct child
 * operations repeated many times within a single parent.
 *
 * Heuristic:
 *   For each parent span, count children grouped by
 *   (db.system, db.statement_hash, db.collection). If a parent has
 *   ≥ MIN_REPEAT children that share the same (system, hash,
 *   collection) but for DISTINCT argument sets (id values), that's
 *   an N+1 candidate.
 *
 * Detection output is a `NPlusOneReport` with the offending parent
 * span IDs and a representative sample of the children. We also flag
 * parents with ≥ CHILD_FANOUT_THRESHOLD children regardless of
 * pattern, as a backstop.
 *
 * Why static detection:
 *   - We can run this against staging trace exports nightly and gate
 *     canary on the report.
 *   - No new instrumentation required; it consumes the same OTel
 *     stream as observability.
 */

import type { SloEntry } from './types.js';

export interface OtelSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeUnixNano: string | number;
  readonly endTimeUnixNano: string | number;
  readonly attributes?: Record<string, string | number | boolean | undefined>;
}

export interface OtelTrace {
  readonly resourceSpans: ReadonlyArray<{
    readonly scopeSpans: ReadonlyArray<{
      readonly spans: readonly OtelSpan[];
    }>;
  }>;
}

export interface NPlusOneFinding {
  readonly parentSpanId: string;
  readonly parentName: string;
  readonly dbSystem: string;
  readonly dbCollection: string;
  readonly statementHash: string;
  /** Number of repeated child spans that match the pattern. */
  readonly repeatCount: number;
  /** Distinct argument sets (typically entity ids) seen in the children. */
  readonly distinctArgs: number;
  /** Sample of the child span IDs that triggered the finding. */
  readonly sampleChildSpanIds: readonly string[];
}

export interface NPlusOneReport {
  readonly spansAnalysed: number;
  readonly findings: readonly NPlusOneFinding[];
  readonly highFanoutParents: ReadonlyArray<{ parentSpanId: string; parentName: string; childCount: number }>;
  readonly pass: boolean;
}

export interface DetectorOpts {
  /** Min number of repeated children before we call it N+1. Default 5. */
  readonly minRepeat?: number;
  /** Children count that triggers the high-fanout backstop. Default 50. */
  readonly childFanoutThreshold?: number;
  /** Max number of sample child span IDs in a finding. Default 5. */
  readonly sampleSize?: number;
}

/** Stable hash for a statement string (FNV-1a, 32-bit). */
export function hashStatement(stmt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < stmt.length; i++) {
    h ^= stmt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Parse a hex/value attribute safely. */
function attr(span: OtelSpan, key: string): string | undefined {
  const v = span.attributes?.[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Analyse a trace export and return N+1 findings.
 */
export function detectNPlusOne(trace: OtelTrace, opts: DetectorOpts = {}): NPlusOneReport {
  const minRepeat = opts.minRepeat ?? 5;
  const fanout = opts.childFanoutThreshold ?? 50;
  const sampleSize = opts.sampleSize ?? 5;

  // Flatten all spans across resource/scope layers.
  const spans: OtelSpan[] = [];
  for (const rs of trace.resourceSpans) {
    for (const ss of rs.scopeSpans) {
      for (const sp of ss.spans) spans.push(sp);
    }
  }

  // Index children by parent.
  const childrenOf = new Map<string, OtelSpan[]>();
  for (const sp of spans) {
    const p = sp.parentSpanId;
    if (!p) continue;
    const list = childrenOf.get(p) ?? [];
    list.push(sp);
    childrenOf.set(p, list);
  }

  const findings: NPlusOneFinding[] = [];
  const highFanout: Array<{ parentSpanId: string; parentName: string; childCount: number }> = [];

  for (const sp of spans) {
    const children = childrenOf.get(sp.spanId);
    if (!children || children.length === 0) continue;

    // Group children by (db.system, hash, collection, statement-template).
    const groups = new Map<
      string,
      {
        system: string;
        collection: string;
        hash: string;
        childSpans: OtelSpan[];
        args: Set<string>;
      }
    >();
    for (const c of children) {
      const system = attr(c, 'db.system');
      const collection = attr(c, 'db.collection') ?? attr(c, 'db.sql.table');
      const stmt = attr(c, 'db.statement') ?? c.name;
      if (!system || !collection) continue;
      const hash = hashStatement(stmt);
      const k = `${system}::${collection}::${hash}`;
      const g = groups.get(k) ?? {
        system,
        collection,
        hash,
        childSpans: [] as OtelSpan[],
        args: new Set<string>(),
      };
      g.childSpans.push(c);
      const arg = attr(c, 'db.statement.args') ?? attr(c, 'db.args.id') ?? '';
      if (arg) g.args.add(arg);
      groups.set(k, g);
    }

    for (const g of groups.values()) {
      if (g.childSpans.length < minRepeat) continue;
      if (g.args.size < Math.min(g.childSpans.length, 2)) continue;
      findings.push({
        parentSpanId: sp.spanId,
        parentName: sp.name,
        dbSystem: g.system,
        dbCollection: g.collection,
        statementHash: g.hash,
        repeatCount: g.childSpans.length,
        distinctArgs: g.args.size,
        sampleChildSpanIds: g.childSpans.slice(0, sampleSize).map((c) => c.spanId),
      });
    }

    if (children.length >= fanout) {
      highFanout.push({
        parentSpanId: sp.spanId,
        parentName: sp.name,
        childCount: children.length,
      });
    }
  }

  return {
    spansAnalysed: spans.length,
    findings,
    highFanoutParents: highFanout,
    pass: findings.length === 0 && highFanout.length === 0,
  };
}

/**
 * Run N+1 detection against all tier-1 read endpoints listed in the
 * SLO catalogue. Returns one report per (service, operation) pair.
 *
 * Caller is responsible for fetching the OTel export per service.
 */
export function summariseNPlusOne(reports: readonly NPlusOneReport[]): {
  readonly totalFindings: number;
  readonly totalHighFanout: number;
  readonly servicesWithFindings: readonly string[];
  readonly pass: boolean;
} {
  const totalFindings = reports.reduce((s, r) => s + r.findings.length, 0);
  const totalHighFanout = reports.reduce((s, r) => s + r.highFanoutParents.length, 0);
  const services = new Set<string>();
  for (const r of reports) {
    for (const f of r.findings) services.add(f.parentName);
  }
  return {
    totalFindings,
    totalHighFanout,
    servicesWithFindings: [...services].sort(),
    pass: totalFindings === 0 && totalHighFanout === 0,
  };
}

/**
 * Top-N tier-1 read endpoints to audit. Centralised so the audit
 * script and tests stay in sync.
 */
export function tier1ReadEndpoints(slos: readonly SloEntry[]): readonly { service: string; operation: string }[] {
  const seen = new Set<string>();
  const out: { service: string; operation: string }[] = [];
  for (const slo of slos) {
    if (slo.tier !== 'tier-1') continue;
    const k = `${slo.service}::${slo.slo}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ service: slo.service, operation: slo.slo });
  }
  return out;
}
