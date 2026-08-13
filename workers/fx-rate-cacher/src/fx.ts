/**
 * @domio/fx-rate-cacher-worker — Phase 19 WS-MKT-7 FX rate cacher worker.
 *
 * Fetches mid-market exchange rates for all currency pairs and upserts them
 * into the fx_rate table. Cross-rates are computed via USD as the pivot.
 *
 * The provider interface is injected; InMemoryFxRateProvider is the
 * default for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FxRateRecord {
  readonly base: string;
  readonly quote: string;
  readonly rate: number;
  readonly source: string;
  readonly fetched_at: Date;
}

export interface FxRateProvider {
  /** Fetch the mid-market rate for a base/quote pair. */
  fetchMidRate(base: string, quote: string): Promise<{ rate: number; source: string }>;
  /** Upsert a rate record into the cache (deduped by base+quote+fetched_at). */
  upsertFxRate(record: FxRateRecord): Promise<FxRateRecord>;
}

export interface FxCacherResult {
  readonly upserted: number;
  readonly pairs: readonly string[];
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface FxRateCacherWorkerOptions {
  readonly provider: FxRateProvider;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// Deterministic rates for in-memory provider
// ---------------------------------------------------------------------------

/** Direct rates against USD. */
const USD_RATES: Record<string, number> = {
  USD: 1,
  BDT: 110,
  EUR: 0.92,
};

/**
 * Compute rate for base→quote by crossing through USD.
 * base→USD = 1/USD_RATES[base]
 * USD→quote = USD_RATES[quote]
 * base→quote = (1/USD_RATES[base]) * USD_RATES[quote]
 */
function crossRate(base: string, quote: string): number {
  if (base === quote) return 1;
  const baseUsd = USD_RATES[base];
  const quoteUsd = USD_RATES[quote];
  if (baseUsd === undefined || quoteUsd === undefined) {
    throw new Error(`Unknown currency: ${base === quote ? base : `${base} or ${quote}`}`);
  }
  return quoteUsd / baseUsd;
}

// ---------------------------------------------------------------------------
// In-memory provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemoryFxRateProvider implements FxRateProvider {
  private readonly upsertedRecords: FxRateRecord[] = [];
  private readonly dedup = new Set<string>();
  public readonly source: string;

  constructor(source?: string) {
    this.source = source ?? 'sandbox';
  }

  async fetchMidRate(base: string, quote: string): Promise<{ rate: number; source: string }> {
    const rate = crossRate(base, quote);
    return { rate, source: this.source };
  }

  async upsertFxRate(record: FxRateRecord): Promise<FxRateRecord> {
    const key = `${record.base}:${record.quote}:${record.fetched_at.toISOString()}`;
    if (this.dedup.has(key)) {
      // Return existing record (dedup)
      return record;
    }
    this.dedup.add(key);
    this.upsertedRecords.push({ ...record });
    return record;
  }

  /** Test helper: get all upserted records. */
  getUpsertedRecords(): readonly FxRateRecord[] {
    return [...this.upsertedRecords];
  }

  /** Test helper: check if a rate was upserted for a given pair and time. */
  hasUpserted(base: string, quote: string, fetched_at: Date): boolean {
    return this.dedup.has(`${base}:${quote}:${fetched_at.toISOString()}`);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/** Currency pairs to fetch (base≠quote, 6 pairs from 3 currencies). */
const CURRENCIES = ['USD', 'BDT', 'EUR'];

function generatePairs(): Array<{ base: string; quote: string }> {
  const pairs: Array<{ base: string; quote: string }> = [];
  for (const base of CURRENCIES) {
    for (const quote of CURRENCIES) {
      if (base !== quote) {
        pairs.push({ base, quote });
      }
    }
  }
  return pairs;
}

export class FxRateCacherWorker {
  private readonly provider: FxRateProvider;
  private readonly nowFn: () => Date;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: FxRateCacherWorkerOptions) {
    if (!opts.provider) throw new Error('FxRateCacherWorker: provider is required');
    this.provider = opts.provider;
    this.nowFn = opts.now ?? (() => new Date());
    this.tickMs = opts.tickMs ?? Number(process.env['WORKER_TICK_MS'] ?? '60000');
    this.logger = opts.logger ?? {
      info: () => {
        /* noop */
      },
      error: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
    };
  }

  /**
   * Start the worker timer loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.tickMs);
    this.logger.info('FxRateCacherWorker started', { tickMs: this.tickMs });
  }

  /**
   * Stop the worker timer loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('FxRateCacherWorker stopped');
  }

  /**
   * Run a single FX rate caching pass:
   *   For each pair in [USD,BDT,EUR]×[USD,BDT,EUR] (base≠quote, 6 pairs):
   *     1. Fetch mid-rate
   *     2. Upsert with fetched_at = now
   *     3. Count upserted
   *
   * Idempotent: same day + same fetched_at → UNIQUE dedup skip.
   */
  async runOnce(): Promise<FxCacherResult> {
    const now = this.nowFn();
    let upserted = 0;
    const pairLabels: string[] = [];

    try {
      const pairs = generatePairs();

      for (const { base, quote } of pairs) {
        try {
          const { rate, source } = await this.provider.fetchMidRate(base, quote);
          await this.provider.upsertFxRate({
            base,
            quote,
            rate,
            source,
            fetched_at: now,
          });
          upserted++;
          pairLabels.push(`${base}/${quote}`);
        } catch (err) {
          this.logger.error('Failed to fetch/cache FX rate', {
            base,
            quote,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('FxRateCacherWorker pass complete', {
        upserted,
        pairs: pairLabels,
      });
    } catch (err) {
      this.logger.error('FxRateCacherWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { upserted, pairs: pairLabels };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
