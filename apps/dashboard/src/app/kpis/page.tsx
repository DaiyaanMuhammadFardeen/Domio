/**
 * /kpis — server component.
 *
 * Loads saved custom KPI definitions from the warehouse via
 * `cohort-service.fetchKpis` and renders the KPI builder so users
 * can add tiles. On an empty warehouse the builder still works —
 * the tile grid renders the empty state.
 */

import { KPIBuilder } from '../../components/KPIBuilder';
import { fetchKpis } from '../../lib/cohort-service';

export default async function KpisPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const initial = await fetchKpis(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Custom KPIs</h1>
        <p className="text-sm text-slate-500">
          Pick a metric, an aggregation, and save a tile to your overview.
        </p>
      </header>

      <KPIBuilder workspaceId={workspaceId} initial={initial} />
    </div>
  );
}
