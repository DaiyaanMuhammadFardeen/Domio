/**
 * Phase 17 integration — in-memory ClickHouse fixture.
 *
 * The real tests run against a live ClickHouse in the phase17
 * docker-compose profile. For unit-level integration we keep a
 * minimal fake that records every issued SQL string and returns
 * canned rows based on a simple table lookup.
 *
 * The fake does NOT execute SQL — it pattern-matches on the table
 * name and returns whatever the test seeded for that table. This is
 * enough to exercise the SQL guard logic in the DAO without
 * spinning up a ClickHouse container.
 */
import type { ClickHouseClient } from '@domio/analytics-warehouse/client/clickhouse';

export class FakeClickHouse implements ClickHouseClient {
  /** tableName → array of rows */
  tables: Map<string, Record<string, unknown>[]> = new Map();
  /** every SQL string + params we have seen, in order. */
  callLog: Array<{ sql: string; params: Record<string, unknown> | undefined }> = [];
  /** when true, ping() returns false. */
  unhealthy = false;

  constructor(seed: Record<string, Record<string, unknown>[]> = {}) {
    for (const [k, v] of Object.entries(seed)) {
      this.tables.set(k, [...v]);
    }
  }

  async query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
    this.callLog.push({ sql, params });
    const table = matchTable(sql);
    if (!table) return [];
    const rows = this.tables.get(table) ?? [];
    return rows.filter((row) => this.matchesParams(row, sql, params)) as unknown as T[];
  }

  async execute(sql: string, params?: Record<string, unknown>): Promise<void> {
    this.callLog.push({ sql, params });
  }

  async raw(): Promise<Response> {
    return new Response('', { status: 200 });
  }

  async ping(): Promise<boolean> {
    return !this.unhealthy;
  }

  /** Test helper: count queries that referenced a table. */
  references(table: string): number {
    return this.callLog.filter((c) => c.sql.includes(table)).length;
  }

  private matchesParams(
    row: Record<string, unknown>,
    sql: string,
    params: Record<string, unknown> | undefined,
  ): boolean {
    if (!params) return true;
    // Naive: each param maps to a column with the same name (workspace_id, deck_id, slide_id, x, y).
    for (const [k, v] of Object.entries(params)) {
      if (k === 'from_ms' || k === 'to_ms') continue;
      if (Array.isArray(v)) continue;
      if (k === 'steps') continue;
      const column = columnForParam(sql, k);
      if (column && String(row[column] ?? '') !== String(v)) {
        return false;
      }
    }
    return true;
  }
}

function matchTable(sql: string): string | undefined {
  const known = [
    'session_agg_mv',
    'slide_metric_5m',
    'heatmap_tile',
    'events',
    'benchmark_snapshot',
  ];
  for (const t of known) {
    if (sql.includes(`FROM ${t}`)) return t;
  }
  return undefined;
}

function columnForParam(sql: string, param: string): string | undefined {
  // The DAO uses {workspace_id:String} → column is workspace_id,
  // {deck_id:String} → deck_id, {slide_id:String} → slide_id.
  // We just rebuild the same convention here.
  if (param === 'workspace_id') return 'workspace_id';
  if (param === 'deck_id') return 'deck_id';
  if (param === 'slide_id') return 'slide_id';
  if (param === 'viewer_id_key') return 'viewer_id_key';
  // The SQL uses {x:Int32} for example; ignore for tests.
  void sql;
  return undefined;
}
