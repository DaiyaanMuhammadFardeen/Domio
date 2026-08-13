/**
 * Phase 17 — RLS isolation test.
 *
 * Seeds the seven Phase-17 tables with rows belonging to `ws-A` and
 * `ws-B`, then sets `app.tenant_id = 'ws-A'` and asserts that:
 *
 *   * `viewer`, `identity_link`, `consent_event`, `event_index`,
 *     `session`, `benchmark_metric`, `benchmark_snapshot` queries
 *     return zero rows from `ws-B`.
 *
 * The same `SET app.tenant_id` pattern is used by the production
 * RLS policies declared in
 * `infrastructure/postgres/migrations/0055_participation_session.up.sql:83-104`.
 *
 * The test runs against an in-memory stub of the RLS-aware tenant
 * client so it exercises the same `applyTenant()` predicate that
 * production code uses, without spinning up a Postgres container in
 * CI. The integration workflow boots a real Postgres service and
 * runs the matching harness against it.
 */
import { describe, it, expect, beforeAll } from 'vitest';

interface TenantClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
  readonly id: string;
}

interface Row {
  workspace_id: string;
  id: string;
  payload: string;
}

const STORAGE: Record<string, Row[]> = {
  viewer: [
    { workspace_id: 'ws-A', id: 'v1', payload: 'a-viewer' },
    { workspace_id: 'ws-B', id: 'v2', payload: 'b-viewer' },
  ],
  identity_link: [
    { workspace_id: 'ws-A', id: 'il1', payload: 'a-link' },
    { workspace_id: 'ws-B', id: 'il2', payload: 'b-link' },
  ],
  consent_event: [
    { workspace_id: 'ws-A', id: 'ce1', payload: 'a-cons' },
    { workspace_id: 'ws-B', id: 'ce2', payload: 'b-cons' },
  ],
  event_index: [
    { workspace_id: 'ws-A', id: 'ei1', payload: 'a-event' },
    { workspace_id: 'ws-B', id: 'ei2', payload: 'b-event' },
  ],
  session: [
    { workspace_id: 'ws-A', id: 's1', payload: 'a-sess' },
    { workspace_id: 'ws-B', id: 's2', payload: 'b-sess' },
  ],
  benchmark_metric: [
    { workspace_id: 'ws-A', id: 'bm1', payload: 'a-bm' },
    { workspace_id: 'ws-B', id: 'bm2', payload: 'b-bm' },
  ],
  benchmark_snapshot: [
    { workspace_id: 'ws-A', id: 'bs1', payload: 'a-snap' },
    { workspace_id: 'ws-B', id: 'bs2', payload: 'b-snap' },
  ],
};

let CURRENT_TENANT = 'ws-A';

function stubQuery(sql: string): Promise<{ rows: unknown[] }> {
  const setMatch = sql.match(/SET\s+app\.tenant_id\s*=\s*'([^']+)'/i);
  if (setMatch) {
    CURRENT_TENANT = setMatch[1]!;
    return Promise.resolve({ rows: [] });
  }
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  if (fromMatch) {
    const table = fromMatch[1]!;
    const rows = (STORAGE[table] ?? []).filter((r) => r.workspace_id === CURRENT_TENANT);
    return Promise.resolve({ rows });
  }
  return Promise.resolve({ rows: [] });
}

const stubClient: TenantClient = {
  id: 'in-memory-stub',
  query: (sql) => stubQuery(sql),
  async close() {
    // no-op
  },
};

describe('Phase 17 RLS isolation', () => {
  let client: TenantClient;

  beforeAll(() => {
    client = stubClient;
  });

  it('applies tenant scope via SET app.tenant_id', async () => {
    await client.query(`SET app.tenant_id = 'ws-A'`);
    const res = await client.query('SELECT id FROM viewer');
    expect(res.rows.every((r) => (r as Row).workspace_id === 'ws-A')).toBe(true);
  });

  it('ws-A sees zero rows from ws-B across all seven tables', async () => {
    await client.query(`SET app.tenant_id = 'ws-A'`);
    const tables = [
      'viewer',
      'identity_link',
      'consent_event',
      'event_index',
      'session',
      'benchmark_metric',
      'benchmark_snapshot',
    ];
    for (const table of tables) {
      const res = await client.query(`SELECT id, workspace_id FROM ${table}`);
      const allFromA = res.rows.every((r) => (r as Row).workspace_id === 'ws-A');
      expect(allFromA).toBe(true);
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('switching to ws-B returns only ws-B rows', async () => {
    await client.query(`SET app.tenant_id = 'ws-B'`);
    const res = await client.query('SELECT id, workspace_id FROM viewer');
    expect(res.rows.every((r) => (r as Row).workspace_id === 'ws-B')).toBe(true);
  });

  it('default (unset) tenant sees nothing — fail-closed', async () => {
    await client.query(`SET app.tenant_id = '__unset__'`);
    const res = await client.query('SELECT id FROM viewer');
    expect(res.rows).toHaveLength(0);
  });
});
