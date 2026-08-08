/**
 * Analytics-warehouse — ClickHouse HTTP client (Phase 17 W2).
 *
 * ClickHouse's HTTP interface is the simplest way to issue read-only
 * queries from TypeScript: it accepts SQL with optional JSONEachRow
 * formatting and returns rows JSON-encoded. We avoid the native
 * protocol because the warehouse is a low-throughput read path, not a
 * bulk-load path.
 *
 * Every query is parameterised through {p:Value} substitution so user
 * input cannot escape into SQL.
 */

import type { WarehouseConfig } from '../types.js';

export interface ClickHouseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
  /** Run a non-SELECT statement (DDL, INSERT, OPTIMIZE). */
  execute(sql: string, params?: Record<string, unknown>): Promise<void>;
  /** Raw fetch for streaming endpoints (NDJSON, CSV). */
  raw(sql: string, params?: Record<string, unknown>): Promise<Response>;
  /** Issue a lightweight liveness check. */
  ping(): Promise<boolean>;
}

export function buildClickHouseClient(cfg: WarehouseConfig): ClickHouseClient {
  const base = cfg.clickhouseUrl.replace(/\/+$/, '');
  const auth =
    cfg.clickhouseUser || cfg.clickhousePassword
      ? 'Basic ' + Buffer.from(`${cfg.clickhouseUser}:${cfg.clickhousePassword}`).toString('base64')
      : '';

  function buildUrl(sql: string, params: Record<string, unknown> | undefined, format: string): string {
    const url = new URL(base);
    if (cfg.clickhouseDb) {
      url.searchParams.set('database', cfg.clickhouseDb);
    }
    url.searchParams.set('query', sql);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(`param_${k}`, formatParam(v));
      }
    }
    url.searchParams.set(format, '');
    return url.toString();
  }

  async function fetchOnce(sql: string, params: Record<string, unknown> | undefined, format: string): Promise<Response> {
    const url = buildUrl(sql, params, format);
    const headers: Record<string, string> = { 'content-type': 'text/plain' };
    if (auth) headers['authorization'] = auth;
    if (cfg.readOnly) {
      headers['x-clickhouse-setting'] = 'readonly = 1';
    }
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) {
      const body = await res.text();
      throw new ClickHouseError(`clickhouse error ${res.status}: ${body}`, res.status);
    }
    return res;
  }

  return {
    async query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
      const res = await fetchOnce(sql, params, 'format_json_each_row');
      const text = await res.text();
      if (!text.trim()) return [];
      return text
        .split(/\n/)
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as T);
    },
    async execute(sql: string, params?: Record<string, unknown>): Promise<void> {
      await fetchOnce(sql, params, 'format_tsv');
    },
    async raw(sql: string, params?: Record<string, unknown>): Promise<Response> {
      return fetchOnce(sql, params, 'format_json_each_row');
    },
    async ping(): Promise<boolean> {
      try {
        const res = await fetchOnce('SELECT 1', undefined, 'format_json_each_row');
        await res.text();
        return true;
      } catch {
        return false;
      }
    },
  };
}

export class ClickHouseError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ClickHouseError';
  }
}

function formatParam(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') {
    // Wrap in single quotes and escape backslashes + single quotes.
    return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(v)) {
    return '[' + v.map((x) => formatParam(x)).join(',') + ']';
  }
  return `'${JSON.stringify(v)}'`;
}
