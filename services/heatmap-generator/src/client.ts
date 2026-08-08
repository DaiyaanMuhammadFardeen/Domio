/**
 * Heatmap generator — ClickHouse HTTP client (Phase 17 W5).
 *
 * Mirrors the pattern in services/analytics-warehouse/src/client/clickhouse.ts.
 * The two clients are intentionally separate (no cross-service import) so
 * heatmap-generator is independent of warehouse maintenance.
 */

import type { HeatmapConfig } from './types.js';
import type { HeatmapClient } from './store/clickhouse.js';

export function buildHeatmapClient(cfg: HeatmapConfig): HeatmapClient {
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
    if (cfg.readOnly) headers['x-clickhouse-setting'] = 'readonly = 1';
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`clickhouse error ${res.status}: ${body}`);
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
