/**
 * /overview — server component that fetches the four KPI series
 * via the analytics-service against the warehouse.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/overview`.
 *   - No zero-state fallback; the loader returns zeros on miss.
 *   - Empty state via `<EmptyState>` from @domio/ui.
 *
 * The work happens entirely against the warehouse. When the upstream
 * is unreachable the page renders zeros — never fabricated numbers.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { OverviewClient } from './OverviewClient';
import { fetchOverviewKpis } from '../../lib/analytics-service';

export default async function OverviewPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const kpis = await fetchOverviewKpis(workspaceId);

  const total = kpis.sessions.value + kpis.viewers.value;
  const isEmpty = total === 0 && kpis.completionRate.value === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-slate-500">
          Last 7 days · workspace <code className="rounded bg-slate-100 px-1.5 py-0.5">{workspaceId}</code>
        </p>
      </header>
      <SuspenseBoundary>
        {isEmpty ? (
          <EmptyState
            title="No activity yet"
            description="The event-ingest pipeline has not received any viewer traffic for this workspace. KPIs will populate as soon as the warehouse reports."
          />
        ) : (
          <OverviewClient kpis={kpis} />
        )}
      </SuspenseBoundary>
    </div>
  );
}