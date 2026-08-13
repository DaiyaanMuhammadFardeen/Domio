'use client';

/**
 * GraphFilters — left filter sidebar for the cross-deck knowledge
 * graph (Wave 11 §S11.15).
 *
 * Controlled component exposing:
 * - Team selector
 * - Time range preset selector
 * - Entity type multi-select
 *
 * Renders counts alongside the entity type checkboxes so users can
 * see at a glance how many entities of each type would remain after
 * toggling. The counts are derived from the full (unfiltered) view,
 * which is the standard analytics pattern.
 *
 * Translations come from the dashboard's `messages/en.json` bundle
 * resolved via a tiny in-file catalogue. When new locales are added
 * later, swap the catalogue import to a context provider.
 */

import enMessages from '../../../messages/en.json';

export type TimeRange = '7d' | '30d' | '90d' | '365d' | 'all';

export interface GraphFiltersState {
  readonly team: string;
  readonly timeRange: TimeRange;
  readonly entityTypes: ReadonlyArray<EntityTypeValue>;
}

export type EntityTypeValue =
  | 'person'
  | 'product'
  | 'kpi'
  | 'company'
  | 'metric';

export interface EntityTypeCount {
  readonly type: EntityTypeValue;
  readonly count: number;
}

export interface GraphFiltersProps {
  readonly teams: ReadonlyArray<string>;
  readonly typeCounts: ReadonlyArray<EntityTypeCount>;
  readonly state: GraphFiltersState;
  readonly onChange: (next: GraphFiltersState) => void;
}

function t(key: string): string {
  const value = (enMessages as Record<string, string>)[key];
  return typeof value === 'string' ? value : key;
}

const TIME_RANGES: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '365d', label: '365d' },
  { value: 'all', label: 'All' },
];

export function GraphFilters({
  teams,
  typeCounts,
  state,
  onChange,
}: GraphFiltersProps) {
  function setTeam(team: string) {
    onChange({ ...state, team });
  }
  function setRange(timeRange: TimeRange) {
    onChange({ ...state, timeRange });
  }
  function toggleType(type: EntityTypeValue) {
    const present = state.entityTypes.includes(type);
    const nextTypes = present
      ? state.entityTypes.filter((tt) => tt !== type)
      : [...state.entityTypes, type];
    onChange({ ...state, entityTypes: nextTypes });
  }
  return (
    <aside
      className="w-full space-y-6 rounded-xl border border-slate-200 bg-white p-4"
      data-testid="graph-filters"
    >
      <section className="space-y-2">
        <label
          htmlFor="graph-filter-team"
          className="block text-xs font-medium uppercase tracking-wide text-slate-500"
        >
          {t('dashboard.graph.filter.team')}
        </label>
        <select
          id="graph-filter-team"
          data-testid="graph-filter-team"
          value={state.team}
          onChange={(e) => setTeam(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="all">{t('dashboard.graph.filter.allTeams')}</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-2">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('dashboard.graph.filter.range')}
        </span>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Time range"
          data-testid="graph-filter-range"
        >
          {TIME_RANGES.map((r) => {
            const active = state.timeRange === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                data-testid={`graph-filter-range-${r.value}`}
                aria-pressed={active}
                className={
                  active
                    ? 'rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white'
                    : 'rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          {t('dashboard.graph.filter.entityTypes')}
        </span>
        <ul className="space-y-1" data-testid="graph-filter-types">
          {typeCounts.map((row) => {
            const checked = state.entityTypes.includes(row.type);
            return (
              <li key={row.type} className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    data-testid={`graph-filter-type-${row.type}`}
                    checked={checked}
                    onChange={() => toggleType(row.type)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {entityTypeLabel(row.type)}
                </label>
                <span className="text-xs text-slate-500" data-testid={`graph-filter-type-count-${row.type}`}>
                  {row.count}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function entityTypeLabel(type: EntityTypeValue): string {
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