/**
 * Freshness tracker — tracks data source freshness and writes
 * staleness records (Phase 08 M5).
 *
 * The tracker maintains a list of bindings and their freshness status.
 * It writes append-only freshness records that accumulate over time
 * and are never mutated.
 *
 * Statuses:
 *  - `ok` — data is fresh (last update within TTL)
 *  - `stale` — data is past its freshness window
 *  - `error` — last fetch attempt failed
 *  - `never` — binding exists but has never been successfully fetched
 *
 * Public surface:
 *  - {@link FreshnessTracker} — the tracker.
 *  - {@link FreshnessRecord} — the record shape.
 *  - {@link FreshnessStatus} — the status enum.
 *  - {@link BindingConfig} — binding configuration.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreshnessStatus = 'ok' | 'stale' | 'error' | 'never';

export interface FreshnessRecord {
  readonly bindingId: string;
  readonly status: FreshnessStatus;
  /** ISO-8601 timestamp when this record was written. */
  readonly recordedAt: Date;
  /** ISO-8601 timestamp when the data expires (goes stale). Null for error/never. */
  readonly expiresAt: Date | null;
  /** Optional error message for error status. */
  readonly error?: string;
}

export interface BindingConfig {
  readonly bindingId: string;
  /** TTL in milliseconds — how long data is considered fresh after a successful fetch. */
  readonly freshnessTtlMs: number;
  /** Grace period in ms after TTL before data is considered stale (default 0). */
  readonly staleGraceMs?: number;
}

export interface FreshnessTrackerOptions {
  /** Clock for testing (default: `() => new Date()`). */
  readonly clock?: () => Date;
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export class FreshnessTracker {
  private readonly records: FreshnessRecord[] = [];
  private readonly bindings = new Map<string, BindingConfig>();
  private readonly clock: () => Date;

  constructor(opts: FreshnessTrackerOptions = {}) {
    this.clock = opts.clock ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Binding management
  // -------------------------------------------------------------------------

  /** Register a binding for tracking. */
  addBinding(config: BindingConfig): void {
    this.bindings.set(config.bindingId, config);
  }

  /** Remove a binding from tracking. */
  removeBinding(bindingId: string): void {
    this.bindings.delete(bindingId);
  }

  /** Get all registered bindings. */
  getBindings(): readonly BindingConfig[] {
    return [...this.bindings.values()];
  }

  // -------------------------------------------------------------------------
  // Status recording
  // -------------------------------------------------------------------------

  /**
   * Record a successful fetch — marks the binding as `ok`.
   */
  signalOk(bindingId: string): FreshnessRecord {
    const binding = this.bindings.get(bindingId);
    const now = this.clock();
    const ttlMs = binding?.freshnessTtlMs ?? 0;
    const record: FreshnessRecord = {
      bindingId,
      status: 'ok',
      recordedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };
    this.records.push(record);
    return record;
  }

  /**
   * Record that a binding's data is stale.
   */
  signalStale(bindingId: string): FreshnessRecord {
    const record: FreshnessRecord = {
      bindingId,
      status: 'stale',
      recordedAt: this.clock(),
      expiresAt: null,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Record that a binding's fetch failed.
   */
  signalError(bindingId: string, error: string): FreshnessRecord {
    const record: FreshnessRecord = {
      bindingId,
      status: 'error',
      recordedAt: this.clock(),
      expiresAt: null,
      error,
    };
    this.records.push(record);
    return record;
  }

  // -------------------------------------------------------------------------
  // Querying
  // -------------------------------------------------------------------------

  /**
   * Get the latest freshness record for a binding.
   * Returns null if no records exist.
   */
  getLatestRecord(bindingId: string): FreshnessRecord | null {
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i]!.bindingId === bindingId) return this.records[i]!;
    }
    return null;
  }

  /**
   * Get all records for a binding (append-only, in order).
   */
  getRecords(bindingId: string): readonly FreshnessRecord[] {
    return this.records.filter((r) => r.bindingId === bindingId);
  }

  /**
   * Get all records (append-only, in order).
   */
  getAllRecords(): readonly FreshnessRecord[] {
    return [...this.records];
  }

  /**
   * Compute the current status of a binding based on its latest record.
   */
  computeStatus(bindingId: string): FreshnessStatus {
    const binding = this.bindings.get(bindingId);
    if (!binding) return 'never';

    const latest = this.getLatestRecord(bindingId);
    if (!latest) return 'never';

    if (latest.status === 'error') return 'error';
    if (latest.status === 'stale') return 'stale';
    if (latest.status === 'never') return 'never';

    // For 'ok' records, check if the data has expired
    if (latest.expiresAt !== null) {
      const now = this.clock();
      const graceMs = binding.staleGraceMs ?? 0;
      if (now.getTime() >= latest.expiresAt.getTime() + graceMs) {
        return 'stale';
      }
    }

    return 'ok';
  }

  /**
   * Scan all bindings and return their current statuses.
   */
  scanAll(): Array<{ bindingId: string; status: FreshnessStatus }> {
    return this.getBindings().map((b) => ({
      bindingId: b.bindingId,
      status: this.computeStatus(b.bindingId),
    }));
  }

  // -------------------------------------------------------------------------
  // Staleness computation
  // -------------------------------------------------------------------------

  /**
   * Check if a specific record is stale given a reference time.
   * Staleness is computed from the record's `expires_at`.
   */
  isRecordStale(record: FreshnessRecord, referenceTime?: Date): boolean {
    if (record.expiresAt === null) return record.status === 'stale' || record.status === 'error';
    const now = referenceTime ?? this.clock();
    const binding = this.bindings.get(record.bindingId);
    const graceMs = binding?.staleGraceMs ?? 0;
    return now.getTime() >= record.expiresAt.getTime() + graceMs;
  }

  /**
   * Get the number of records (for append-only verification in tests).
   */
  recordCount(): number {
    return this.records.length;
  }
}
