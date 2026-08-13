/**
 * /team — server component.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md:
 *   - Wired to `GET /v1/analytics/team/{templates,components,brands,retention}`.
 *   - No STUB fallback.
 *   - SuspenseBoundary + `<EmptyState>` from @domio/ui.
 *
 * Shows template/component/brand rankings + retention cohort table
 * from team-analytics. Renders an empty state when the upstream is
 * unreachable — never fabricated stub data.
 *
 * Wave 7 §S7.10 mounts the TeamLeaderboard and TemplateUsageHeatmap
 * client components for the most active creators + the engagement
 * heatmap of templates by category.
 */

import { SuspenseBoundary, EmptyState } from '@domio/ui';
import { TeamLeaderboard } from '../../components/TeamLeaderboard';
import { TemplateUsageHeatmap } from '../../components/TemplateUsageHeatmap';
import {
  fetchCreatorLeaderboard,
  fetchTeamAnalytics,
  fetchTemplateUsageHeatmap,
} from '../../lib/team-service';
import { CrossLinksFooter } from '../../components/CrossLinksFooter';

export default async function TeamPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const [data, leaderboard, heatmap] = await Promise.all([
    fetchTeamAnalytics(workspaceId),
    fetchCreatorLeaderboard(workspaceId),
    fetchTemplateUsageHeatmap(workspaceId),
  ]);
  const hasAny =
    data.templates.length > 0 ||
    data.components.length > 0 ||
    data.brands.length > 0 ||
    data.retention.length > 0 ||
    leaderboard.creators.length > 0 ||
    leaderboard.templates.length > 0 ||
    heatmap.cells.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team analytics</h1>
        <p className="text-sm text-slate-500">
          Top templates, components, brand health, retention, leaderboard &amp; engagement
        </p>
      </header>

      <TeamLeaderboard
        workspaceId={workspaceId}
        initialCreators={leaderboard.creators}
        initialTemplates={leaderboard.templates}
      />

      <TemplateUsageHeatmap workspaceId={workspaceId} initialCells={heatmap.cells} />

      <SuspenseBoundary>
        {hasAny ? (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Ranking
                title="Top templates"
                rows={data.templates.map((t) => ({
                  id: t.templateId,
                  name: t.name,
                  value: t.totalViews,
                }))}
              />
              <Ranking
                title="Top components"
                rows={data.components.map((c) => ({
                  id: c.componentId,
                  name: c.name,
                  value: c.usage,
                }))}
              />
              <Ranking
                title="Brand health"
                rows={data.brands.map((b) => ({
                  id: b.brandId,
                  name: `${b.name} (${b.health})`,
                  value: b.activeTokens,
                }))}
              />
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Retention cohorts
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Cohort</th>
                      <th className="px-4 py-2 text-right">D7</th>
                      <th className="px-4 py-2 text-right">D30</th>
                      <th className="px-4 py-2 text-right">D90</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.retention.map((r) => (
                      <tr key={r.cohort}>
                        <td className="px-4 py-2 font-medium">{r.cohort}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {(r.d7 * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {(r.d30 * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {(r.d90 * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <EmptyState
            title="No team analytics yet"
            description="team-analytics has not yet reported for this workspace. Top templates, components, brand health, and retention cohorts will populate once the upstream is reachable."
          />
        )}
      </SuspenseBoundary>
      <CrossLinksFooter nodeId="doc.dashboard.team" />
    </div>
  );
}

interface RankingRow {
  id: string;
  name: string;
  value: number;
}

function Ranking({ title, rows }: { title: string; rows: RankingRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      <ol className="space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between">
            <span className="text-slate-800">
              <span className="mr-2 inline-block w-4 text-right text-slate-400">{i + 1}.</span>
              {r.name}
            </span>
            <span className="tabular-nums text-slate-500">{r.value.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
