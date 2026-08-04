/**
 * DataSourcePanel — left-side panel for managing live data sources.
 * Lists demo mock datasets with freshness indicators, provides
 * a "Add mock dataset" affordance, and shows connection state.
 *
 * P08 — live data & interactive charts.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getDataSources,
  addMockDataset,
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
  const [newName, setNewName] = useState('');
  const [newSeed, setNewSeed] = useState('100');
  const [newRows, setNewRows] = useState('20');

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

  const handleAdd = useCallback(() => {
    const name = newName.trim() || `Mock Dataset ${sources.length + 1}`;
    const seed = parseInt(newSeed, 10) || 100;
    const rows = parseInt(newRows, 10) || 20;
    addMockDataset(name, seed, Math.min(rows, 500));
    setNewName('');
    setNewSeed(String(seed + 1));
    setNewRows('20');
  }, [newName, newSeed, newRows, sources.length]);

  return (
    <section className="data-panel" data-testid="data-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Data Sources</h2>
        <span className="data-panel__sub">{sources.length} sources</span>
      </header>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Sources</div>
        {sources.length === 0 ? (
          <div className="data-panel__empty">No data sources</div>
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

      <div className="data-panel__section">
        <div className="data-panel__section-title">Add mock dataset</div>
        <div className="data-panel__add-row">
          <div>
            <label htmlFor="ds-name">Name</label>
            <input
              id="ds-name"
              className="data-panel__add-input"
              placeholder="Dataset name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ds-seed">Seed</label>
            <input
              id="ds-seed"
              className="data-panel__add-input"
              type="number"
              min={1}
              value={newSeed}
              onChange={(e) => setNewSeed(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="ds-rows">Rows</label>
            <input
              id="ds-rows"
              className="data-panel__add-input"
              type="number"
              min={1}
              max={500}
              value={newRows}
              onChange={(e) => setNewRows(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="data-panel__add-btn"
            onClick={handleAdd}
            data-testid="p08-add-dataset-btn"
          >
            Add
          </button>
        </div>
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
