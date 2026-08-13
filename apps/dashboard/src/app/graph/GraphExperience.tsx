'use client';

/**
 * GraphExperience — client wrapper that owns filter state and
 * coordinates the three-pane cross-deck knowledge graph UI.
 *
 * Per Wave 11 §S11.15 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  GraphCanvas,
  GraphFilters,
  EntityDetail,
  type GraphFiltersState,
  type EntityTypeValue,
} from '../../components/graph';
import { getGraph, type Entity, type GraphView } from '../../lib/knowledge-graph-service';
import enMessages from '../../../messages/en.json';

function t(key: string): string {
  const value = (enMessages as Record<string, string>)[key];
  return typeof value === 'string' ? value : key;
}

const TYPE_ORDER: ReadonlyArray<EntityTypeValue> = [
  'person',
  'product',
  'kpi',
  'company',
  'metric',
];

const RANGE_SINCE_MS: Record<GraphFiltersState['timeRange'], number | undefined> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
  all: undefined,
};

export interface GraphExperienceProps {
  readonly initial: GraphView;
}

export function GraphExperience({ initial }: GraphExperienceProps) {
  const [state, setState] = useState<GraphFiltersState>({
    team: 'all',
    timeRange: '90d',
    entityTypes: [...TYPE_ORDER],
  });
  const [view, setView] = useState<GraphView>(initial);
  const [selected, setSelected] = useState<Entity | null>(null);

  // Re-query the graph whenever filters change. We send the
  // desired entity types, team, and time range; the service
  // applies them and falls back to seed data on failure.
  useEffect(() => {
    let cancelled = false;
    const sinceMs = RANGE_SINCE_MS[state.timeRange];
    const baseMs = Date.now();
    const opts: Parameters<typeof getGraph>[0] = {
      ...(state.team !== 'all' ? { team: state.team } : {}),
      entityTypes: state.entityTypes,
      ...(sinceMs !== undefined ? { sinceMs: baseMs - sinceMs } : {}),
    };
    void (async () => {
      const next = await getGraph(opts);
      if (!cancelled) setView(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Clear selection when filters hide the selected entity.
  useEffect(() => {
    if (!selected) return;
    const stillVisible = view.entities.some((e) => e.id === selected.id);
    if (!stillVisible) setSelected(null);
  }, [view, selected]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    initial.entities.forEach((e) => set.add(e.team));
    return Array.from(set).sort();
  }, [initial]);

  const typeCounts = useMemo(() => {
    const counts = new Map<EntityTypeValue, number>();
    TYPE_ORDER.forEach((tt) => counts.set(tt, 0));
    initial.entities.forEach((e) => {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    });
    return TYPE_ORDER.map((tt) => ({
      type: tt,
      count: counts.get(tt) ?? 0,
    }));
  }, [initial]);

  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]"
      data-testid="graph-experience"
    >
      <GraphFilters teams={teams} typeCounts={typeCounts} state={state} onChange={setState} />

      <div className="space-y-3">
        <p className="text-xs text-slate-500" data-testid="graph-legend">
          {t('dashboard.graph.legend')}
        </p>
        {view.entities.length === 0 ? (
          <div
            className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
            data-testid="graph-empty"
          >
            {t('dashboard.graph.empty')}
          </div>
        ) : (
          <GraphCanvas
            entities={view.entities}
            edges={view.edges}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        )}
        <p className="text-xs text-slate-500" data-testid="graph-summary">
          {view.total_entities} entities · {view.total_edges} edges
        </p>
      </div>

      <EntityDetail entity={selected} />
    </div>
  );
}
