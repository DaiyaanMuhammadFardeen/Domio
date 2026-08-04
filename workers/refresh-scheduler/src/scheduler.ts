/**
 * Refresh scheduler — timer-based query refresh (Phase 08 M2).
 *
 * Reads queries whose freshness_policy.type ∈ {eager, on_interval}.
 * For `on_interval`, schedules refreshes at exact ticks with drift ≤1s.
 * For `eager`, triggers on a `trigger()` call (stage-open signal).
 */

// ---------------------------------------------------------------------------
// Types (local to avoid cross-package dependency)
// ---------------------------------------------------------------------------

export type FreshnessPolicyType = 'eager' | 'on_interval' | 'on_demand';

export interface FreshnessPolicy {
  readonly type: FreshnessPolicyType;
  readonly intervalMs?: number;
}

export interface QueryRecord {
  readonly queryId: string;
  readonly orgId: string;
  readonly sql: string;
  readonly connectorId: string;
  readonly params: readonly unknown[];
  readonly freshnessPolicy: FreshnessPolicy;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledQuery {
  readonly queryId: string;
  readonly orgId: string;
  readonly intervalMs: number;
  /** Exact timestamp (ms since epoch) when the next tick should fire. */
  nextTickMs: number;
}

export interface SchedulerCallbacks {
  /** Called when a query needs refreshing. */
  refresh(queryId: string, orgId: string): Promise<void>;
  /** Called to get all queries with a given freshness type. */
  listQueries(type: FreshnessPolicyType): Promise<QueryRecord[]>;
  /** Called to get current time (injectable for tests). */
  now?(): number;
}

export interface SchedulerOptions {
  /** Maximum drift in ms before a tick is considered late. Default: 1000. */
  maxDriftMs?: number;
  /** Tick interval for the scheduler loop in ms. Default: 100. */
  tickIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class RefreshScheduler {
  private scheduled = new Map<string, ScheduledQuery>();
  private eagerQueries = new Map<string, QueryRecord>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly callbacks: SchedulerCallbacks;
  private readonly maxDriftMs: number;
  private readonly tickIntervalMs: number;

  constructor(callbacks: SchedulerCallbacks, opts: SchedulerOptions = {}) {
    this.callbacks = callbacks;
    this.maxDriftMs = opts.maxDriftMs ?? 1000;
    this.tickIntervalMs = opts.tickIntervalMs ?? 100;
  }

  /**
   * Start the scheduler loop. Reads queries from the callback and
   * sets up timers for `on_interval` queries.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load queries
    const intervalQueries = await this.callbacks.listQueries('on_interval');
    const eagerQueries = await this.callbacks.listQueries('eager');

    const now = this.now();
    for (const q of intervalQueries) {
      const intervalMs = q.freshnessPolicy.intervalMs ?? 60_000;
      this.scheduled.set(q.queryId, {
        queryId: q.queryId,
        orgId: q.orgId,
        intervalMs,
        nextTickMs: now + intervalMs,
      });
    }

    for (const q of eagerQueries) {
      this.eagerQueries.set(q.queryId, q);
    }

    // Start the tick loop
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  /**
   * Stop the scheduler loop and clear all timers.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.scheduled.clear();
    this.eagerQueries.clear();
  }

  /**
   * Trigger eager refresh for a specific query (stage-open signal).
   */
  async trigger(queryId: string): Promise<void> {
    const query = this.eagerQueries.get(queryId);
    if (query) {
      await this.callbacks.refresh(queryId, query.orgId);
    }
  }

  /**
   * Trigger refresh for a specific query (regardless of type).
   */
  async triggerRefresh(queryId: string, orgId: string): Promise<void> {
    await this.callbacks.refresh(queryId, orgId);
  }

  /**
   * Add a query to the scheduler at runtime.
   */
  addQuery(query: QueryRecord): void {
    if (query.freshnessPolicy.type === 'on_interval') {
      const intervalMs = query.freshnessPolicy.intervalMs ?? 60_000;
      this.scheduled.set(query.queryId, {
        queryId: query.queryId,
        orgId: query.orgId,
        intervalMs,
        nextTickMs: this.now() + intervalMs,
      });
    } else if (query.freshnessPolicy.type === 'eager') {
      this.eagerQueries.set(query.queryId, query);
    }
  }

  /**
   * Remove a query from the scheduler.
   */
  removeQuery(queryId: string): void {
    this.scheduled.delete(queryId);
    this.eagerQueries.delete(queryId);
  }

  /**
   * Get the number of scheduled queries.
   */
  get scheduledCount(): number {
    return this.scheduled.size;
  }

  /**
   * Get the number of eager queries.
   */
  get eagerCount(): number {
    return this.eagerQueries.size;
  }

  /**
   * Check if the scheduler is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private now(): number {
    return this.callbacks.now?.() ?? Date.now();
  }

  /**
   * Tick: check all scheduled queries and fire those whose next tick
   * has arrived (within the drift tolerance).
   */
  private tick(): void {
    const now = this.now();
    for (const [queryId, scheduled] of this.scheduled) {
      if (now >= scheduled.nextTickMs) {
        // Check drift: how late are we?
        const drift = now - scheduled.nextTickMs;
        if (drift <= this.maxDriftMs) {
          // Schedule next tick first (to maintain interval cadence)
          scheduled.nextTickMs += scheduled.intervalMs;
          // Fire the refresh
          void this.callbacks.refresh(queryId, scheduled.orgId);
        } else {
          // Too much drift, reschedule from now
          scheduled.nextTickMs = now + scheduled.intervalMs;
        }
      }
    }
  }
}
