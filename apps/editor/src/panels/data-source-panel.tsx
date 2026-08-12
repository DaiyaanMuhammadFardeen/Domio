/**
 * DataSourcePanel — left-side panel for managing live data sources.
 * Lists connected sources with freshness indicators and shows
 * connection state. New sources connect via the connector panel,
 * not by generating fake data in-app.
 *
 * P08 — live data & interactive charts.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getDataSources,
  removeDataSource,
  refreshSource,
  subscribe,
  tickFreshness,
  type DataSource,
} from '../lib/live-data-store';

interface DataSourcePanelProps {
  selectedSourceId: string | null;
  onSelectSource: (id: string | null) => void;
}

export function DataSourcePanel({
  selectedSourceId,
  onSelectSource,
}: DataSourcePanelProps): ReactElement {
  const [tick, setTick] = useState(0);

  // Re-render on store changes
  useEffect(() => {
    const unsub = subscribe(() => setTick((n) => n + 1));
    // Start freshness tick
    const interval = setInterval(tickFreshness, 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const sources = useMemo(() => getDataSources(), [tick]);

  return (
    <section className="data-panel" data-testid="data-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Data Sources</h2>
        <span className="data-panel__sub">{sources.length} sources</span>
      </header>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Sources</div>
        {sources.length === 0 ? (
          <div className="data-panel__empty" data-testid="data-panel-empty-state">
            No data sources connected. Open the Connectors panel to link a CSV,
            webhook, or HTTP API.
          </div>
        ) : (
          sources.map((ds) => (
            <DataSourceRow
              key={ds.id}
              ds={ds}
              isSelected={ds.id === selectedSourceId}
              onSelect={() => onSelectSource(ds.id === selectedSourceId ? null : ds.id)}
              onRefresh={() => refreshSource(ds.id)}
              onRemove={() => removeDataSource(ds.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DataSourceRow({
  ds,
  isSelected,
  onSelect,
  onRefresh,
  onRemove,
}: {
  ds: DataSource;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`data-source-row${isSelected ? ' is-selected' : ''}`}
      onClick={onSelect}
      data-testid={`p08-source-${ds.id}`}
    >
      <span className={`freshness-dot freshness-dot--${ds.freshness}`} title={ds.freshness} />
      <span className="data-source-row__info">
        <span className="data-source-row__name">{ds.name}</span>
        <span className="data-source-row__meta">
          <span className="data-source-row__rows">{ds.rowCount} rows</span>
          <span className={`data-source-row__badge data-source-row__badge--${ds.kind}`}>
            {ds.kind === 'mock' ? 'Mock' : 'Connected'}
          </span>
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        title="Refresh"
        onClick={(e) => { e.stopPropagation(); onRefresh(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRefresh(); } }}
        style={{ cursor: 'pointer', fontSize: 14, color: 'var(--muted)', padding: '2px 4px' }}
      >
        ↻
      </span>
      <span
        role="button"
        tabIndex={0}
        title="Remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemove(); } }}
        style={{ cursor: 'pointer', fontSize: 14, color: 'var(--muted)', padding: '2px 4px' }}
      >
        ×
      </span>
    </button>
  );
}
