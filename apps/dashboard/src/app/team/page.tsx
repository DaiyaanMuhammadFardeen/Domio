/**
 * /team — server component.
 *
 * Shows template/component/brand rankings + retention cohort heatmap
 * from team-analytics. Falls back to deterministic stub data.
 */

import { fetcher } from '../../lib/fetcher';

const TEAM_ANALYTICS_URL =
  process.env['TEAM_ANALYTICS_URL'] ?? 'http://localhost:8093';

interface TemplateRow {
  template_id: string;
  name: string;
  workspace_count: number;
  total_views: number;
}

interface ComponentRow {
  component_id: string;
  name: string;
  usage: number;
}

interface BrandHealth {
  brand_id: string;
  name: string;
  health: 'green' | 'amber' | 'red';
  active_tokens: number;
}

interface RetentionCell {
  cohort: string;
  d7: number;
  d30: number;
  d90: number;
}

const STUB: {
  templates: TemplateRow[];
  components: ComponentRow[];
  brands: BrandHealth[];
  retention: RetentionCell[];
} = {
  templates: [
    { template_id: 'tpl-1', name: 'Sales pitch', workspace_count: 412, total_views: 91_233 },
    { template_id: 'tpl-2', name: 'Investor update', workspace_count: 287, total_views: 38_412 },
    { template_id: 'tpl-3', name: 'Onboarding deck', workspace_count: 198, total_views: 22_100 },
  ],
  components: [
    { component_id: 'cmp-1', name: 'CTA button', usage: 4_120 },
    { component_id: 'cmp-2', name: 'Pricing table', usage: 2_240 },
    { component_id: 'cmp-3', name: 'Footer', usage: 1_812 },
  ],
  brands: [
    { brand_id: 'br-1', name: 'Acme', health: 'green', active_tokens: 28 },
    { brand_id: 'br-2', name: 'Globex', health: 'amber', active_tokens: 12 },
    { brand_id: 'br-3', name: 'Initech', health: 'red', active_tokens: 4 },
  ],
  retention: [
    { cohort: '2026-06', d7: 0.62, d30: 0.41, d90: 0.28 },
    { cohort: '2026-07', d7: 0.58, d30: 0.39, d90: 0.25 },
    { cohort: '2026-08', d7: 0.65, d30: 0.44, d90: 0.31 },
  ],
};

async function fetchTeam(workspaceId: string): Promise<typeof STUB> {
  try {
    const [templates, components, brands, retention] = await Promise.all([
      fetcher<{ rows: TemplateRow[] }>(TEAM_ANALYTICS_URL, '/v1/team/templates/top', { workspaceId }),
      fetcher<{ rows: ComponentRow[] }>(TEAM_ANALYTICS_URL, '/v1/team/components/top', { workspaceId }),
      fetcher<{ rows: BrandHealth[] }>(TEAM_ANALYTICS_URL, '/v1/team/brands/health', { workspaceId }),
      fetcher<{ rows: RetentionCell[] }>(TEAM_ANALYTICS_URL, '/v1/team/retention', { workspaceId }),
    ]);
    return {
      templates: templates.rows ?? [],
      components: components.rows ?? [],
      brands: brands.rows ?? [],
      retention: retention.rows ?? [],
    };
  } catch {
    return STUB;
  }
}

export default async function TeamPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const data = await fetchTeam(workspaceId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team analytics</h1>
        <p className="text-sm text-slate-500">
          Top templates, components, brand health, retention
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Ranking title="Top templates" rows={data.templates.map((t) => ({ id: t.template_id, name: t.name, value: t.total_views }))} />
        <Ranking title="Top components" rows={data.components.map((c) => ({ id: c.component_id, name: c.name, value: c.usage }))} />
        <Ranking
          title="Brand health"
          rows={data.brands.map((b) => ({
            id: b.brand_id,
            name: `${b.name} (${b.health})`,
            value: b.active_tokens,
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
                  <td className="px-4 py-2 text-right tabular-nums">{(r.d7 * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(r.d30 * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(r.d90 * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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