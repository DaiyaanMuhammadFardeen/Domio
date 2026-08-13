'use client';

/**
 * EntityDetail — right detail panel for the cross-deck knowledge graph.
 *
 * Per Wave 11 §S11.15 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Surfaces the selected entity's metadata + every referencing slide
 * across decks, with a freshness badge for each slide. References are
 * grouped by deck so users can see at a glance which decks cite the
 * entity, and how stale each reference is.
 */

import { useEffect, useMemo, useState } from 'react';

import enMessages from '../../../messages/en.json';
import {
  getEntityReferences,
  type Entity,
  type EntityReference,
  type EntityType,
} from '../../lib/knowledge-graph-service';

function t(key: string): string {
  const value = (enMessages as Record<string, string>)[key];
  return typeof value === 'string' ? value : key;
}

export interface EntityDetailProps {
  readonly entity: Entity | null;
}

const FRESHNESS_COLOR: Record<EntityReference['freshness'], string> = {
  fresh: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  stale: 'bg-amber-100 text-amber-800 border-amber-200',
  outdated: 'bg-rose-100 text-rose-800 border-rose-200',
};

export function EntityDetail({ entity }: EntityDetailProps) {
  const [references, setReferences] = useState<EntityReference[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entity) {
      setReferences([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const refs = await getEntityReferences(entity.id);
      if (!cancelled) {
        setReferences(refs);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const grouped = useMemo(() => groupByDeck(references), [references]);

  if (!entity) {
    return (
      <aside
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        data-testid="entity-detail-empty"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          {t('dashboard.graph.legend')}
        </h2>
        <p className="text-xs text-slate-500">
          {t('dashboard.graph.subheading')}
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
      data-testid="entity-detail"
    >
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-semibold text-slate-900"
            data-testid="entity-detail-name"
          >
            {entity.name}
          </h2>
          <span
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
            data-testid="entity-detail-type"
          >
            {entityTypeLabel(entity.type)}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {t('dashboard.graph.detail.references')}: {entity.reference_count}
        </p>
      </header>

      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : references.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="entity-detail-empty-refs">
          {t('dashboard.graph.detail.empty')}
        </p>
      ) : (
        <div className="space-y-3" data-testid="entity-detail-refs">
          <div className="hidden grid-cols-12 gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:grid">
            <span className="col-span-4">{t('dashboard.graph.detail.col.deck')}</span>
            <span className="col-span-4">{t('dashboard.graph.detail.col.slide')}</span>
            <span className="col-span-2">{t('dashboard.graph.detail.col.freshness')}</span>
            <span className="col-span-2">{t('dashboard.graph.detail.col.lastReferenced')}</span>
          </div>
          {grouped.map((deckGroup) => (
            <section
              key={deckGroup.deck_id}
              className="space-y-1 rounded-md border border-slate-100 p-2"
              data-testid={`entity-detail-deck-${deckGroup.deck_id}`}
            >
              <h3 className="text-xs font-semibold text-slate-700">
                {deckGroup.deck_title}
              </h3>
              <ul className="space-y-1">
                {deckGroup.references.map((ref) => (
                  <li
                    key={ref.slide_id}
                    className="grid grid-cols-12 gap-2 text-xs"
                    data-testid={`entity-detail-ref-${ref.slide_id}`}
                  >
                    <span className="col-span-4 truncate text-slate-700 sm:text-slate-500">
                      {deckGroup.deck_title}
                    </span>
                    <span className="col-span-4 truncate text-slate-700">
                      {ref.slide_title}
                    </span>
                    <span className="col-span-2">
                      <span
                        className={
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ' +
                          FRESHNESS_COLOR[ref.freshness]
                        }
                        data-testid={`entity-detail-freshness-${ref.freshness}`}
                      >
                        {freshnessLabel(ref.freshness)}
                      </span>
                    </span>
                    <span className="col-span-2 text-slate-500">
                      {formatDate(ref.last_referenced_at_ms)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}

interface DeckGroup {
  readonly deck_id: string;
  readonly deck_title: string;
  readonly references: ReadonlyArray<EntityReference>;
}

function groupByDeck(refs: ReadonlyArray<EntityReference>): DeckGroup[] {
  const groups = new Map<string, DeckGroup>();
  for (const ref of refs) {
    const existing = groups.get(ref.deck_id);
    if (existing) {
      groups.set(ref.deck_id, {
        ...existing,
        references: [...existing.references, ref],
      });
    } else {
      groups.set(ref.deck_id, {
        deck_id: ref.deck_id,
        deck_title: ref.deck_title,
        references: [ref],
      });
    }
  }
  return Array.from(groups.values());
}

function entityTypeLabel(type: EntityType): string {
  switch (type) {
    case 'person':
      return t('dashboard.graph.entityType.person');
    case 'product':
      return t('dashboard.graph.entityType.product');
    case 'kpi':
      return t('dashboard.graph.entityType.kpi');
    case 'company':
      return t('dashboard.graph.entityType.company');
    case 'metric':
      return t('dashboard.graph.entityType.metric');
  }
}

function freshnessLabel(freshness: EntityReference['freshness']): string {
  switch (freshness) {
    case 'fresh':
      return t('dashboard.graph.freshness.fresh');
    case 'stale':
      return t('dashboard.graph.freshness.stale');
    case 'outdated':
      return t('dashboard.graph.freshness.outdated');
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}