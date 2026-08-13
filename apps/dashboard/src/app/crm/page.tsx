/**
 * /crm — server component.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/crm/syncs`.
 *   - No fabricated adapter list.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Renders per-provider adapter health + DLQ depth for the crm-sync
 * worker, plus the per-contact event timeline written back to
 * Salesforce/HubSpot. When the worker is unreachable the page renders
 * an empty state — never a fabricated adapter list.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { Badge } from '../../components/Badge';
import { CRMTimeline } from '../../components/CRMTimeline';
import {
  fetchCrmTimeline,
  fetchSyncStats,
  type AdapterHealth,
} from '../../lib/crm-service';

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
  const [stats, timeline] = await Promise.all([
    fetchSyncStats(workspaceId),
    fetchCrmTimeline(workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">CRM sync</h1>
        <p className="text-sm text-slate-500">
          Adapter health · idempotency collisions · DLQ depth · per-contact event timeline
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Idempotency collisions (24h)" value={stats.idempotencyCollisions24h} />
        <Stat label="DLQ depth" value={stats.dlqDepth} />
        <Stat label="Adapters" value={stats.adapters.length} />
      </section>

      <SuspenseBoundary>
        {stats.adapters.length === 0 ? (
          <EmptyState
            title="No adapter data"
            description="crm-sync is not reporting. Once the worker is reachable, adapter health, idempotency collisions, and DLQ depth will populate here."
          />
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
      </SuspenseBoundary>

      <CRMTimeline
        workspaceId={workspaceId}
        initialEvents={timeline}
        adapters={stats.adapters}
      />
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