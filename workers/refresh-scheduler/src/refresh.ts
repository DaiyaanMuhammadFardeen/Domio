/**
 * Refresh worker — query execution + freshness recording (Phase 08 M2).
 *
 * Calls the gateway execute path to refresh a query's data, then writes
 * a dataset_snapshot + freshness_record(status 'ok', source 'poll').
 * On failure, writes freshness_record(status 'error').
 */

import type { QueryRecord } from './scheduler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatasetSnapshot {
  readonly snapshotId: string;
  readonly queryId: string;
  readonly orgId: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
  readonly createdAt: Date;
}

export type FreshnessStatus = 'ok' | 'error' | 'stale';

export interface FreshnessRecord {
  readonly recordId: string;
  readonly queryId: string;
  readonly orgId: string;
  readonly snapshotId: string | null;
  readonly status: FreshnessStatus;
  readonly source: 'poll' | 'webhook' | 'manual';
  readonly errorMessage?: string;
  readonly createdAt: Date;
}

export interface RefreshCallbacks {
  /** Execute a query and return the result. */
  executeQuery(
    queryId: string,
    orgId: string,
  ): Promise<{ columns: string[]; rows: readonly (readonly unknown[])[] }>;
  /** Write a dataset snapshot. */
  writeSnapshot(snapshot: DatasetSnapshot): Promise<void>;
  /** Write a freshness record. */
  writeFreshness(record: FreshnessRecord): Promise<void>;
  /** Generate a unique ID. */
  idGenerator(): string;
  /** Get current time. */
  clock(): Date;
  /** Look up a query by ID. */
  getQuery(queryId: string, orgId: string): Promise<QueryRecord | null>;
}

// ---------------------------------------------------------------------------
// refreshQuery
// ---------------------------------------------------------------------------

/**
 * Execute a query refresh: call the gateway execute path, then write
 * dataset_snapshot + freshness_record.
 *
 * On failure, writes a freshness_record with status 'error'.
 */
export async function refreshQuery(
  queryId: string,
  orgId: string,
  callbacks: RefreshCallbacks,
): Promise<{ snapshot: DatasetSnapshot | null; freshness: FreshnessRecord }> {
  const now = callbacks.clock();

  try {
    const result = await callbacks.executeQuery(queryId, orgId);

    const snapshotId = callbacks.idGenerator();
    const snapshot: DatasetSnapshot = {
      snapshotId,
      queryId,
      orgId,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rows.length,
      createdAt: now,
    };
    await callbacks.writeSnapshot(snapshot);

    const freshness: FreshnessRecord = {
      recordId: callbacks.idGenerator(),
      queryId,
      orgId,
      snapshotId,
      status: 'ok',
      source: 'poll',
      createdAt: now,
    };
    await callbacks.writeFreshness(freshness);

    return { snapshot, freshness };
  } catch (err) {
    const freshness: FreshnessRecord = {
      recordId: callbacks.idGenerator(),
      queryId,
      orgId,
      snapshotId: null,
      status: 'error',
      source: 'poll',
      errorMessage: err instanceof Error ? err.message : String(err),
      createdAt: now,
    };
    await callbacks.writeFreshness(freshness);
    return { snapshot: null, freshness };
  }
}
