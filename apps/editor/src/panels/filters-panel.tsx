/**
 * FiltersPanel — left-side panel for managing cross-chart global filters.
 * Each filter = { id, dimension, value } where dimension is a column name
 * shared across datasets. Charts opt in via `listenToFilters` on their binding.
 *
 * Wave 2 §S2.7 — Data sources. Adds "Apply to all slides on this deck" CTA.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { CrossFilter } from '@domio/canvas';

// All known dimension columns across demo datasets
const KNOWN_DIMENSIONS = ['month', 'category', 'region', 'stage', 'rep'] as const;

interface FiltersPanelProps {
  filters: CrossFilter[];
  onChange: (filters: CrossFilter[]) => void;
  /** Optional callback when "apply to all slides" is clicked. */
  onApplyAllSlides?: ((filter: CrossFilter) => void) | undefined;
}

export function FiltersPanel({
  filters,
  onChange,
  onApplyAllSlides,
}: FiltersPanelProps): ReactElement {
  const [newDimension, setNewDimension] = useState<string>(KNOWN_DIMENSIONS[0]);
  const [newValue, setNewValue] = useState('');

  const handleAdd = useCallback(() => {
    const dim = newDimension;
    const val = newValue.trim();
    if (!dim || !val) return;
    const filter: CrossFilter = {
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dimension: dim,
      value: val,
    };
    onChange([...filters, filter]);
    setNewValue('');
  }, [newDimension, newValue, filters, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      onChange(filters.filter((f) => f.id !== id));
    },
    [filters, onChange],
  );

  return (
    <section className="data-panel" data-testid="filters-panel">
      <header className="data-panel__header">
        <h2 className="data-panel__title">Cross-Chart Filters</h2>
        <span className="data-panel__sub">
          {filters.length === 0 ? 'No active filters' : `${filters.length} active`}
        </span>
      </header>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Active Filters</div>
        {filters.length === 0 ? (
          <div className="data-panel__empty">No active filters</div>
        ) : (
          filters.map((f) => (
            <div key={f.id} className="data-source-row" data-testid={`p08-filter-row-${f.id}`}>
              <span className="data-source-row__info">
                <span className="data-source-row__name">
                  <span className="data-source-row__badge data-source-row__badge--mock">
                    {f.dimension}
                  </span>
                  {' = '}
                  {f.value}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Apply to all slides on this deck"
                onClick={() => onApplyAllSlides?.(f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onApplyAllSlides?.(f);
                }}
                style={{
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--muted)',
                  padding: '2px 4px',
                }}
                data-testid={`p08-filter-apply-all-${f.id}`}
              >
                ⤢
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Remove filter"
                onClick={() => handleRemove(f.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRemove(f.id);
                }}
                style={{
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--muted)',
                  padding: '2px 4px',
                }}
              >
                ×
              </span>
            </div>
          ))
        )}
      </div>

      <div className="data-panel__section">
        <div className="data-panel__section-title">Add Filter</div>
        <div className="data-panel__add-row">
          <div>
            <label htmlFor="filter-dimension">Dimension</label>
            <select
              id="filter-dimension"
              className="data-panel__add-input"
              value={newDimension}
              onChange={(e) => setNewDimension(e.target.value)}
              data-testid="p08-filter-dimension"
            >
              {KNOWN_DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-value">Value</label>
            <input
              id="filter-value"
              className="data-panel__add-input"
              placeholder="Enter value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              data-testid="p08-filter-value"
            />
          </div>
          <button
            type="button"
            className="data-panel__add-btn"
            onClick={handleAdd}
            data-testid="p08-filter-add"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
