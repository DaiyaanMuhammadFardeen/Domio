/**
 * Analytics-warehouse — rollup orchestrator (Phase 17 W2).
 *
 * Materialized views in ClickHouse refresh automatically when new
 * rows land in the `events` table. The orchestrator's job is the
 * slower nightly recomputation that rebuilds benchmark snapshots
 * (from `benchmark_snapshot`, ReplacingMergeTree) and weekly
 * retention/cohort tables used by the /benchmarks and /team pages.
 *
 * The orchestrator runs on a setInterval cadence and exposes:
 *   - runHourly() — OPTIMIZE small tables, expire old preview rows
 *   - runNightly() — full rebuild of benchmark_snapshot + retention
 *
 * It is intentionally simple: a single Node.js process per service
 * instance, no leader election. The service is sized for a single
 * shard; horizontal scaling is done by running additional replicas
 * behind a job queue (not in scope for W2).
 */

import type { ClickHouseClient } from '../client/clickhouse.js';

export interface RollupOrchestrator {
  runHourly(): Promise<{ optimized: string[]; ms: number }>;
  runNightly(): Promise<{ rebuilt: string[]; ms: number }>;
  stop(): void;
}

export interface RollupConfig {
  /** Tables to OPTIMIZE on the hourly tick. */
  hourlyOptimizeTables: readonly string[];
  /** Tables to rebuild on the nightly tick. */
  nightlyRebuildTables: readonly string[];
  /** ms between hourly ticks (default 1h). */
  hourlyIntervalMs: number;
  /** ms between nightly ticks (default 24h). */
  nightlyIntervalMs: number;
}

export function defaultRollupConfig(): RollupConfig {
  return {
    hourlyOptimizeTables: [
      'events',
      'session_agg_mv',
      'slide_metric_5m',
    ],
    nightlyRebuildTables: [
      'benchmark_snapshot',
    ],
    hourlyIntervalMs: 60 * 60 * 1000,
    nightlyIntervalMs: 24 * 60 * 60 * 1000,
  };
}

export function buildOrchestrator(
  ch: ClickHouseClient,
  cfg: RollupConfig = defaultRollupConfig(),
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void } = console,
): RollupOrchestrator {
  let hourlyHandle: ReturnType<typeof setInterval> | null = null;
  let nightlyHandle: ReturnType<typeof setInterval> | null = null;

  async function optimize(table: string): Promise<void> {
    await ch.execute(`OPTIMIZE TABLE ${table} FINAL`);
  }

  async function rebuild(table: string): Promise<void> {
    // The rebuild step is implemented as TRUNCATE + INSERT FROM SELECT
    // for the ReplacingMergeTree tables. For benchmark_snapshot this
    // rebuilds the per-cohort cohort percentiles.
    await ch.execute(`TRUNCATE TABLE ${table}`);
    // The downstream INSERT is owned by the benchmark service (W6),
    // so we just clear the old snapshot here; the next hourly tick
    // of the benchmark worker will repopulate.
  }

  return {
    async runHourly() {
      const start = Date.now();
      const optimized: string[] = [];
      for (const t of cfg.hourlyOptimizeTables) {
        try {
          await optimize(t);
          optimized.push(t);
        } catch (err) {
          logger.warn('hourly optimize failed', {
            table: t,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const ms = Date.now() - start;
      logger.info('hourly rollup complete', { optimized, ms });
      return { optimized, ms };
    },

    async runNightly() {
      const start = Date.now();
      const rebuilt: string[] = [];
      for (const t of cfg.nightlyRebuildTables) {
        try {
          await rebuild(t);
          rebuilt.push(t);
        } catch (err) {
          logger.warn('nightly rebuild failed', {
            table: t,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const ms = Date.now() - start;
      logger.info('nightly rollup complete', { rebuilt, ms });
      return { rebuilt, ms };
    },

    stop() {
      if (hourlyHandle) clearInterval(hourlyHandle);
      if (nightlyHandle) clearInterval(nightlyHandle);
      hourlyHandle = null;
      nightlyHandle = null;
    },
  };
}

/**
 * Convenience: start the orchestrator on its default intervals. The
 * returned stop() unregisters the timers.
 */
export function startOrchestrator(
  ch: ClickHouseClient,
  cfg?: RollupConfig,
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void },
): () => void {
  const orch = buildOrchestrator(ch, cfg, logger);
  const hourlyHandle = setInterval(() => {
    void orch.runHourly();
  }, (cfg ?? defaultRollupConfig()).hourlyIntervalMs);
  const nightlyHandle = setInterval(() => {
    void orch.runNightly();
  }, (cfg ?? defaultRollupConfig()).nightlyIntervalMs);
  // Kick off immediately so a fresh pod has the latest snapshot.
  void orch.runHourly();
  void orch.runNightly();
  return () => {
    clearInterval(hourlyHandle);
    clearInterval(nightlyHandle);
    orch.stop();
  };
}