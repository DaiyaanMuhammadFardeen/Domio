/**
 * @domio/obs-control-plane — type definitions.
 */

/** Service tier. */
export type ServiceTier = 'tier-1' | 'tier-2' | 'tier-3';

/** SLO kind. */
export type SloKind = 'availability' | 'latency' | 'quality';

/** A row in `docs/slos/catalogue.md`, parsed. */
export interface SloEntry {
  /** Service package name (`@domio/<name>`). */
  readonly service: string;
  /** SLO short name (e.g. `avail-rt-gateway`, `lat-audience-p95`). */
  readonly slo: string;
  /** Human-readable target string (e.g. `99.9%`, `< 200 ms`). */
  readonly target: string;
  /** Numeric target as a probability in [0, 1]. 0.999 for 99.9%. */
  readonly targetProbability: number;
  /** Rolling window (e.g. `30d`). */
  readonly window: string;
  /** Window in seconds, for arithmetic. */
  readonly windowSeconds: number;
  /** Service tier. */
  readonly tier: ServiceTier;
  /** Owning team or squad. */
  readonly owner: string;
  /** Alert prefix (the `Alert` column in the catalogue). */
  readonly alertPrefix: string;
  /** SLO kind. */
  readonly kind: SloKind;
  /** Latency threshold in ms, only for kind === 'latency'. */
  readonly latencyThresholdMs?: number;
}

/** Parsed runbook reference. */
export interface RunbookRef {
  readonly service: string;
  readonly slo: string;
  readonly path: string;
}

/** Parsed status-page component. */
export interface StatusPageComponent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: ServiceTier;
  readonly healthCheckUrl: string;
  readonly sloEntries: readonly string[];
}

/** Multi-window burn-rate alert, generated from one SLO. */
export interface BurnRateAlert {
  readonly alertName: string;
  readonly slo: SloEntry;
  readonly window: '1h' | '6h' | '24h' | '72h';
  readonly burnRateThreshold: number;
  readonly severity: 'page' | 'ticket';
  readonly for_: string;
  readonly runbookPath: string;
}

/** Generated Alertmanager route. */
export interface AlertmanagerRoute {
  readonly matchers: ReadonlyArray<{ name: string; value: string }>;
  readonly receiver: string;
  readonly groupBy: readonly string[];
  readonly groupWait: string;
  readonly groupInterval: string;
  readonly repeatInterval: string;
}

/** Error thrown when a malformed catalogue row is parsed. */
export class SloParseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(line !== undefined ? `[line ${line}] ${message}` : message);
    this.name = 'SloParseError';
  }
}
