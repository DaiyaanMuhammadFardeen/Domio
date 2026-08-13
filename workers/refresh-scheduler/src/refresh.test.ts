/**
 * Refresh worker tests — covers happy path, error path, and idempotency.
 */

import { describe, it, expect } from 'vitest';
import { refreshQuery } from './refresh.js';
import type { RefreshCallbacks, DatasetSnapshot, FreshnessRecord } from './refresh.js';

function makeCallbacks(overrides: Partial<RefreshCallbacks> = {}): RefreshCallbacks & {
  snapshots: DatasetSnapshot[];
  freshnessRecords: FreshnessRecord[];
  idCounter: number;
} {
  const state = {
    snapshots: [] as DatasetSnapshot[],
    freshnessRecords: [] as FreshnessRecord[],
    idCounter: 0,
  };

  return {
    ...state,
    executeQuery: async (_queryId: string, _orgId: string) => {
      return {
        columns: ['id', 'name', 'value'],
        rows: [
          [1, 'alice', 100],
          [2, 'bob', 200],
        ],
      };
    },
    writeSnapshot: async (snapshot: DatasetSnapshot) => {
      state.snapshots.push(snapshot);
    },
    writeFreshness: async (record: FreshnessRecord) => {
      state.freshnessRecords.push(record);
    },
    idGenerator: () => {
      state.idCounter++;
      return `gen-${state.idCounter.toString().padStart(4, '0')}`;
    },
    clock: () => new Date('2026-08-04T12:00:00Z'),
    getQuery: async () => null,
    ...overrides,
  };
}

describe('refreshQuery — happy path', () => {
  it('writes snapshot and freshness record with status ok', async () => {
    const cb = makeCallbacks();
    const result = await refreshQuery('q1', 'org-1', cb);

    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.columns).toEqual(['id', 'name', 'value']);
    expect(result.snapshot!.rowCount).toBe(2);
    expect(result.snapshot!.queryId).toBe('q1');
    expect(result.snapshot!.orgId).toBe('org-1');

    expect(result.freshness.status).toBe('ok');
    expect(result.freshness.source).toBe('poll');
    expect(result.freshness.snapshotId).toBe(result.snapshot!.snapshotId);
    expect(result.freshness.queryId).toBe('q1');

    expect(cb.snapshots).toHaveLength(1);
    expect(cb.freshnessRecords).toHaveLength(1);
  });

  it('generates unique IDs for snapshot and freshness', async () => {
    const cb = makeCallbacks();
    const result = await refreshQuery('q1', 'org-1', cb);

    expect(result.snapshot!.snapshotId).toMatch(/^gen-/);
    expect(result.freshness.recordId).toMatch(/^gen-/);
    expect(result.snapshot!.snapshotId).not.toBe(result.freshness.recordId);
  });
});

describe('refreshQuery — error path', () => {
  it('writes freshness record with status error on failure', async () => {
    const cb = makeCallbacks({
      executeQuery: async () => {
        throw new Error('Query execution failed');
      },
    });
    const result = await refreshQuery('q1', 'org-1', cb);

    expect(result.snapshot).toBeNull();
    expect(result.freshness.status).toBe('error');
    expect(result.freshness.source).toBe('poll');
    expect(result.freshness.errorMessage).toBe('Query execution failed');
    expect(result.freshness.snapshotId).toBeNull();

    expect(cb.snapshots).toHaveLength(0);
    expect(cb.freshnessRecords).toHaveLength(1);
  });

  it('handles non-Error exceptions', async () => {
    const cb = makeCallbacks({
      executeQuery: async () => {
        throw 'string error';
      },
    });
    const result = await refreshQuery('q1', 'org-1', cb);

    expect(result.snapshot).toBeNull();
    expect(result.freshness.status).toBe('error');
    expect(result.freshness.errorMessage).toBe('string error');
  });
});

describe('refreshQuery — idempotency', () => {
  it('calling refreshQuery twice creates two snapshots', async () => {
    const cb = makeCallbacks();
    await refreshQuery('q1', 'org-1', cb);
    await refreshQuery('q1', 'org-1', cb);

    expect(cb.snapshots).toHaveLength(2);
    expect(cb.freshnessRecords).toHaveLength(2);
    // Both should be ok
    expect(cb.freshnessRecords[0]!.status).toBe('ok');
    expect(cb.freshnessRecords[1]!.status).toBe('ok');
  });
});
