/**
 * Live-analytics — ClickHouse HTTP client (Phase 17 W10).
 *
 * Same shape as services/team-analytics/src/store/clickhouse.ts but
 * parameterised for the live session summary table. We only ever
 * INSERT into `live_session_summary`; reads go through the warehouse
 * (services/analytics-warehouse).
 */

import type { LiveAnalyticsConfig } from '../types.js';

export interface ClickHouseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
  execute(sql: string, params?: Record<string, unknown>): Promise<void>;
  ping(): Promise<boolean>;
}

export function buildClickHouseClient(cfg: LiveAnalyticsConfig): ClickHouseClient {
  const base = cfg.clickhouseUrl.replace(/\/+$/, '');
  const auth =
    cfg.clickhouseUser || cfg.clickhousePassword
      ? 'Basic ' + Buffer.from(`${cfg.clickhouseUser}:${cfg.clickhousePassword}`).toString('base64')
      : '';

  function buildUrl(sql: string, params: Record<string, unknown> | undefined, format: string): string {
    const url = new URL(base);
    if (cfg.clickhouseDb) url.searchParams.set('database', cfg.clickhouseDb);
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
    return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(v)) {
    return '[' + v.map((x) => formatParam(x)).join(',') + ']';
  }
  return `'${JSON.stringify(v)}'`;
}

export interface InMemoryClickHouseClient extends ClickHouseClient {
  executes: { sql: string; params?: Record<string, unknown> }[];
}

export function buildInMemoryClickHouseClient(): InMemoryClickHouseClient {
  const state: InMemoryClickHouseClient = {
    executes: [],
    async query<T>() {
      return [] as T[];
    },
    async execute(sql: string, params?: Record<string, unknown>): Promise<void> {
      state.executes.push(params === undefined ? { sql } : { sql, params });
    },
    async ping(): Promise<boolean> {
      return true;
    },
  };
  return state;
}