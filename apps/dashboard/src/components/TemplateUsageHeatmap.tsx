'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchTemplateUsageHeatmap,
  TEAM_ANALYTICS_CATEGORIES,
  type TemplateUsageCell,
} from '../lib/team-service';

export interface TemplateUsageHeatmapProps {
  workspaceId: string;
  initialCells?: ReadonlyArray<TemplateUsageCell>;
}

function intensityTone(intensity: number): string {
  // Map 0–100 to a Tailwind brand scale. Higher engagement = darker.
  if (intensity >= 80) return 'bg-brand-700 text-white';
  if (intensity >= 60) return 'bg-brand-600 text-white';
  if (intensity >= 40) return 'bg-brand-500 text-white';
  if (intensity >= 20) return 'bg-brand-300 text-brand-900';
  if (intensity > 0) return 'bg-brand-100 text-brand-800';
  return 'bg-slate-100 text-slate-500';
}

/**
 * TemplateUsageHeatmap — which templates drive the most engagement.
 *
 * Each row is a template; columns are categories. Cell color is the
 * engagement intensity (0–100). Filters by category at the top.
 */
export function TemplateUsageHeatmap({
  workspaceId,
  initialCells,
}: TemplateUsageHeatmapProps) {
  const [cells, setCells] = useState<ReadonlyArray<TemplateUsageCell>>(
    initialCells ?? [],
  );
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    if (initialCells !== undefined) return;
    let cancelled = false;
    async function load() {
      const data = await fetchTemplateUsageHeatmap(
        workspaceId,
        category === 'all' ? null : category,
      );
      if (!cancelled) setCells(data.cells);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, category, initialCells]);

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateUsageCell[]>();
    for (const cell of cells) {
      const list = map.get(cell.templateName) ?? [];
      list.push(cell);
      map.set(cell.templateName, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cells]);

  const categoriesInUse = useMemo(() => {
    const seen = new Set<string>();
    for (const c of cells) seen.add(c.category);
    return Array.from(seen).sort();
  }, [cells]);

  const cols =
    categoriesInUse.length > 0 ? categoriesInUse : TEAM_ANALYTICS_CATEGORIES;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white"
      data-testid="template-heatmap"
    >
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Template × category engagement
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="heatmap-category" className="text-slate-500">
            Category
          </label>
          <select
            id="heatmap-category"
            data-testid="heatmap-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            {TEAM_ANALYTICS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </header>
      {grouped.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500" role="status">
          No template usage reported yet.
        </div>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-slate-500">Template</th>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-1 text-left text-slate-500">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(([template, list]) => (
                <tr key={template} data-testid="heatmap-row">
                  <td className="px-2 py-1 font-medium text-slate-800">{template}</td>
                  {cols.map((c) => {
                    const cell = list.find((x) => x.category === c);
                    const intensity = cell?.engagement ?? 0;
                    return (
                      <td key={c} className="px-2 py-1">
                        <div
                          data-testid="heatmap-cell"
                          className={`flex h-7 min-w-[64px] items-center justify-center rounded text-[10px] font-semibold tabular-nums ${intensityTone(intensity)}`}
                          title={
                            cell
                              ? `${cell.views.toLocaleString()} views · ${intensity.toFixed(0)}% engagement`
                              : 'No data'
                          }
                        >
                          {cell ? `${intensity.toFixed(0)}%` : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}