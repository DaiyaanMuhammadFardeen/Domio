/**
 * BindInspector — rendered inside PropsPanel when a live chart layer
 * is selected. Shows data source selector, field mapping, validation
 * status, last-synced timestamp, and drag-and-drop rebinding.
 *
 * Wave 2 §S2.7 — Data sources.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { ChartType } from '@domio/chart';
import { validateBinding, type BindingSchema } from '@domio/chart';
import {
  getDataSources,
  getRequiredRoles,
  type LiveDataBinding,
} from '../lib/live-data-store';
import { formatLastSynced } from '../lib/connector-service';

interface BindInspectorProps {
  binding: LiveDataBinding;
  onChange: (binding: LiveDataBinding) => void;
  chartType?: ChartType;
}

export function BindInspector({ binding, onChange, chartType }: BindInspectorProps): ReactElement {
  const [dragOverRole, setDragOverRole] = useState<string | null>(null);
  const sources = useMemo(() => getDataSources(), []);
  const selectedSource = useMemo(
    () => (binding.queryId ? sources.find((s) => s.id === binding.queryId) : null),
    [binding.queryId, sources],
  );

  const requiredRoles = useMemo(
    () => (chartType ? getRequiredRoles(chartType) : []),
    [chartType],
  );

  const validationErrors = useMemo(() => {
    if (!chartType || !selectedSource) return [];
    const schema: BindingSchema = {
      type: chartType,
      columns: requiredRoles.map((r) => ({
        role: r.role as BindingSchema['columns'][number]['role'],
        column: binding.fieldMap[r.role] ?? '',
      })).filter((c) => c.column !== ''),
    };
    return validateBinding(schema, selectedSource.dataset);
  }, [chartType, selectedSource, requiredRoles, binding.fieldMap]);

  const isValid = validationErrors.length === 0;
  const isFullyBound = requiredRoles.every((r) => binding.fieldMap[r.role]);

  const handleSourceChange = useCallback(
    (sourceId: string) => {
      onChange({ ...binding, queryId: sourceId || null });
    },
    [binding, onChange],
  );

  const handleFieldChange = useCallback(
    (role: string, column: string) => {
      onChange({ ...binding, fieldMap: { ...binding.fieldMap, [role]: column } });
    },
    [binding, onChange],
  );

  // Drag-and-drop: drop a column onto a role to bind it.
  const handleDrop = useCallback(
    (role: string, column: string) => {
      onChange({ ...binding, fieldMap: { ...binding.fieldMap, [role]: column } });
      setDragOverRole(null);
    },
    [binding, onChange],
  );

  return (
    <div className="bind-inspector" data-testid="p08-bind-inspector">
      <div className="bind-inspector__section">
        <div className="bind-inspector__section-title">Data Binding</div>

        <div className="bind-inspector__row">
          <span className="bind-inspector__label">Source</span>
          <select
            className="bind-inspector__select"
            value={binding.queryId ?? ''}
            onChange={(e) => handleSourceChange(e.target.value)}
            data-testid="p08-bind-source"
          >
            <option value="">None</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.rowCount} rows)
              </option>
            ))}
          </select>
        </div>

        {selectedSource && (
          <div
            className="bind-inspector__row"
            data-testid="p08-bind-last-synced"
            title={new Date(selectedSource.lastUpdated).toISOString()}
          >
            <span className="bind-inspector__label">Last synced</span>
            <span className="bind-inspector__muted">
              {formatLastSynced(selectedSource.lastUpdated)}
            </span>
          </div>
        )}

        {selectedSource && (
          <div className="bind-inspector__section">
            <div className="bind-inspector__section-title">Field Mapping</div>
            {requiredRoles.map((r) => (
              <div key={r.role} className="bind-inspector__row">
                <span className="bind-inspector__label">{r.role}</span>
                <select
                  className="bind-inspector__select"
                  value={binding.fieldMap[r.role] ?? ''}
                  onChange={(e) => handleFieldChange(r.role, e.target.value)}
                  data-testid={`p08-bind-field-${r.role}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverRole(r.role);
                  }}
                  onDragLeave={() => setDragOverRole(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    let col = '';
                    try {
                      col = e.dataTransfer?.getData('text/domio-column') ?? '';
                    } catch {
                      col = (window as unknown as { __domioDragColumn?: string }).__domioDragColumn ?? '';
                    }
                    if (col) handleDrop(r.role, col);
                  }}
                  style={dragOverRole === r.role ? { outline: '2px dashed var(--accent)' } : undefined}
                >
                  <option value="">Select column…</option>
                  {selectedSource.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {selectedSource && (
          <div className="bind-inspector__palette" data-testid="p08-bind-column-palette">
            <div className="bind-inspector__section-title">Columns</div>
            <div className="bind-inspector__chips">
              {selectedSource.columns.map((c) => (
                <span
                  key={c.name}
                  className="bind-inspector__chip"
                  draggable
                  onDragStart={(e) => {
                    try {
                      e.dataTransfer?.setData('text/domio-column', c.name);
                    } catch {
                      // jsdom without DataTransfer support — fall back to global
                      (window as unknown as { __domioDragColumn?: string }).__domioDragColumn = c.name;
                    }
                  }}
                  data-testid={`p08-bind-chip-${c.name}`}
                >
                  {c.name} ({c.type})
                </span>
              ))}
            </div>
            <p className="bind-inspector__hint">Drag a column onto a role to rebind.</p>
          </div>
        )}

        {selectedSource && isFullyBound && (
          <div className="bind-inspector__row">
            <span className="bind-inspector__label">Status</span>
            <span className={`bind-inspector__status bind-inspector__status--${isValid ? 'valid' : 'invalid'}`}>
              {isValid ? 'Valid' : `${validationErrors.length} error(s)`}
            </span>
          </div>
        )}

        {validationErrors.map((err: { message: string }, i: number) => (
          <div key={i} className="bind-inspector__error">
            {err.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Detect chart type from a component catalogId.
 */
export function catalogIdToChartType(catalogId: string): ChartType | undefined {
  const match = catalogId.match(/^domio\.live-(.+)$/);
  if (!match) return undefined;
  const type = match[1] as string;
  const validTypes: string[] = [
    'bar', 'line', 'area', 'pie', 'scatter', 'funnel', 'sankey',
    'treemap', 'heatmap', 'waterfall', 'gauge', 'radar', 'candlestick', 'bullet',
  ];
  return validTypes.includes(type) ? (type as ChartType) : undefined;
}