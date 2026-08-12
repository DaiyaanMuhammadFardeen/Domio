/**
 * crm-service — typed client for the CRM sync health surface.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps `/v1/health/stats` on the crm-sync service. When the service
 * is unreachable the loader returns an empty adapter list — the page
 * then renders an empty state. Adapter health is treated as real
 * data, not as a place to ship a placeholder array.
 */

export interface AdapterHealth {
  readonly provider: string;
  readonly status: 'healthy' | 'degraded' | 'down';
  readonly lastRunMs: number | null;
  readonly avgDurationMs: number;
}

export interface SyncStats {
  readonly adapters: ReadonlyArray<AdapterHealth>;
  readonly idempotencyCollisions24h: number;
  readonly dlqDepth: number;
}

const EMPTY_STATS: SyncStats = {
  adapters: [],
  idempotencyCollisions24h: 0,
  dlqDepth: 0,
};

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['CRM_SYNC_URL'] : undefined) ??
  'http://localhost:8095';

/**
 * Fetch the crm-sync health stats for a workspace.
 *
 * Returns `EMPTY_STATS` on any failure. The caller renders an empty
 * state in that case — never fabricated adapters.
 */
export async function fetchSyncStats(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<SyncStats> {
  const url = new URL('/v1/health/stats', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return EMPTY_STATS;
    return (await res.json()) as SyncStats;
  } catch {
    return EMPTY_STATS;
  }
}
