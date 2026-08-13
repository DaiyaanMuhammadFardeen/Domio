/**
 * crm-service — typed client for the CRM sync health surface.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Wraps `/v1/health/stats` on the crm-sync service. When the service
 * is unreachable the loader returns an empty adapter list — the page
 * then renders an empty state. Adapter health is treated as real
 * data, not as a place to ship a placeholder array.
 *
 * Wave 7 §S7.8 adds per-contact event timeline (`/v1/crm/syncs`)
 * plus retry triggering for failed adapter runs.
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

export type CrmEventKind =
  | 'contact_synced'
  | 'field_updated'
  | 'tag_added'
  | 'stage_changed'
  | 'sync_failed'
  | 'retry_succeeded';

export interface CrmTimelineEvent {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly provider: string;
  readonly kind: CrmEventKind;
  readonly summary: string;
  readonly occurredAtMs: number;
}

interface SyncStatsWire {
  adapters?: Array<{
    provider?: string;
    status?: string;
    last_run_ms?: number | null;
    avg_duration_ms?: number;
  }>;
  idempotency_collisions_24h?: number;
  dlq_depth?: number;
}

function asStatus(value: string | undefined): AdapterHealth['status'] {
  if (value === 'healthy' || value === 'degraded' || value === 'down') {
    return value;
  }
  return 'down';
}

function mapAdapter(raw: NonNullable<SyncStatsWire['adapters']>[number]): AdapterHealth {
  return {
    provider: String(raw.provider ?? ''),
    status: asStatus(raw.status),
    lastRunMs: typeof raw.last_run_ms === 'number' ? raw.last_run_ms : null,
    avgDurationMs: Number(raw.avg_duration_ms ?? 0),
  };
}

interface CrmTimelineEventWire {
  id?: string;
  contact_id?: string;
  contact_name?: string;
  provider?: string;
  kind?: string;
  summary?: string;
  occurred_at_ms?: number;
}

const VALID_KINDS: ReadonlyArray<CrmEventKind> = [
  'contact_synced',
  'field_updated',
  'tag_added',
  'stage_changed',
  'sync_failed',
  'retry_succeeded',
];

function asKind(value: string | undefined): CrmEventKind {
  return (VALID_KINDS as readonly string[]).includes(value ?? '')
    ? (value as CrmEventKind)
    : 'contact_synced';
}

function timelineEventFromWire(wire: CrmTimelineEventWire): CrmTimelineEvent {
  return {
    id: wire.id ?? '',
    contactId: wire.contact_id ?? '',
    contactName: wire.contact_name ?? '',
    provider: wire.provider ?? '',
    kind: asKind(wire.kind),
    summary: wire.summary ?? '',
    occurredAtMs: Number(wire.occurred_at_ms ?? Date.now()),
  };
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
  const url = new URL('/v1/crm/syncs', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return EMPTY_STATS;
    const json = (await res.json()) as SyncStatsWire;
    return {
      adapters: (json.adapters ?? []).map(mapAdapter),
      idempotencyCollisions24h: Number(json.idempotency_collisions_24h ?? 0),
      dlqDepth: Number(json.dlq_depth ?? 0),
    };
  } catch {
    return EMPTY_STATS;
  }
}

/**
 * Fetch the per-contact event timeline written back to Salesforce /
 * HubSpot. Returns an empty list on any failure.
 */
export async function fetchCrmTimeline(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
  limit: number = 50,
): Promise<ReadonlyArray<CrmTimelineEvent>> {
  const url = new URL('/v1/crm/syncs', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('limit', String(limit));
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: CrmTimelineEventWire[] };
    const events = (json.events ?? []).map(timelineEventFromWire);
    return events.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Trigger a retry of the most recent failed sync run for an adapter.
 * Returns `true` when the dispatcher accepts the retry.
 */
export async function retryAdapterRun(
  workspaceId: string,
  provider: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<boolean> {
  const url = new URL('/v1/crm/syncs/retry', baseUrl);
  url.searchParams.set('workspace_id', workspaceId);
  url.searchParams.set('provider', provider);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
