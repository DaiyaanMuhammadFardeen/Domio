/**
 * /overview — server component that fetches the four KPI series
 * via the analytics-service against the warehouse.
 *
 * On any failure the page renders with zeros — never fabricated
 * numbers — so the page stays honest when the warehouse is offline.
 */

import { OverviewClient } from './OverviewClient';
import { fetchOverviewKpis } from '../../lib/analytics-service';

export default async function OverviewPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const kpis = await fetchOverviewKpis(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-slate-500">
          Last 7 days · workspace <code className="rounded bg-slate-100 px-1.5 py-0.5">{workspaceId}</code>
        </p>
      </header>
      <OverviewClient kpis={kpis} />
    </div>
  );
}