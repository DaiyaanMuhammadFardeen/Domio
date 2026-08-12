/**
 * /crm — server component.
 *
 * Renders per-provider adapter health + DLQ depth for the crm-sync
 * worker. When the worker is unreachable the page renders an empty
 * state — no fabricated adapter list.
 */

import { Badge } from '../../components/Badge';
import { fetchSyncStats, type AdapterHealth } from '../../lib/crm-service';

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

      {stats.adapters.length === 0 ? (
        <div
          className="rounded-xl border border-slate-200 bg-white p-8 text-center"
          role="status"
        >
          <h2 className="text-base font-semibold text-slate-900">No adapter data</h2>
          <p className="mt-2 text-sm text-slate-500">
            crm-sync is not reporting. Once the worker is reachable, adapter health,
            idempotency collisions, and DLQ depth will populate here.
          </p>
        </div>
      ) : (
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
      )}
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