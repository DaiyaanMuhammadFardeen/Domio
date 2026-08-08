/**
 * /crm — server component.
 *
 * Renders per-provider adapter health + DLQ depth for the crm-sync
 * worker. Falls back to representative stub data when the worker
 * isn't reachable.
 */

import { Badge } from '../../components/Badge';

const CRM_SYNC_URL = process.env['CRM_SYNC_URL'] ?? 'http://localhost:8095';

interface AdapterHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  lastRunMs: number | null;
  avgDurationMs: number;
}

interface SyncStats {
  adapters: AdapterHealth[];
  idempotencyCollisions24h: number;
  dlqDepth: number;
}

const STUB: SyncStats = {
  adapters: [
    { provider: 'HubSpot', status: 'healthy', lastRunMs: Date.now() - 12_000, avgDurationMs: 220 },
    { provider: 'Salesforce', status: 'healthy', lastRunMs: Date.now() - 8_000, avgDurationMs: 410 },
    { provider: 'Intercom', status: 'degraded', lastRunMs: Date.now() - 45_000, avgDurationMs: 980 },
    { provider: 'Outreach', status: 'down', lastRunMs: Date.now() - 600_000, avgDurationMs: 1200 },
  ],
  idempotencyCollisions24h: 4,
  dlqDepth: 2,
};

async function fetchSyncStats(workspaceId: string): Promise<SyncStats> {
  try {
    // The crm-sync service is a Go NATS consumer; we expose a status
    // endpoint at /v1/health/stats when CRM_SYNC_STATS=1.
    const url = new URL('/v1/health/stats', CRM_SYNC_URL);
    url.searchParams.set('workspace_id', workspaceId);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return STUB;
    return (await res.json()) as SyncStats;
  } catch {
    return STUB;
  }
}

function toneForHealth(status: AdapterHealth['status']) {
  switch (status) {
    case 'healthy':
      return 'green' as const;
    case 'degraded':
      return 'yellow' as const;
    case 'down':
      return 'red' as const;
  }
}

function formatAge(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

export default async function CrmPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const stats = await fetchSyncStats(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CRM sync</h1>
        <p className="text-sm text-slate-500">
          Adapter health · idempotency collisions · DLQ depth
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Idempotency collisions (24h)" value={stats.idempotencyCollisions24h} />
        <Stat label="DLQ depth" value={stats.dlqDepth} />
        <Stat label="Adapters" value={stats.adapters.length} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Last run</th>
              <th className="px-4 py-2 text-right">Avg duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.adapters.map((a) => (
              <tr key={a.provider}>
                <td className="px-4 py-2 font-medium text-slate-900">{a.provider}</td>
                <td className="px-4 py-2">
                  <Badge tone={toneForHealth(a.status)}>{a.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {formatAge(a.lastRunMs)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {a.avgDurationMs} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}