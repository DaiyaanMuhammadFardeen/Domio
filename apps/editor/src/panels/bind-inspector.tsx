/**
 * BindInspector — rendered inside PropsPanel when a live chart layer
 * is selected. Shows data source selector, field mapping, and
 * validation status.
 *
 * P08 — live data & interactive charts.
 */

'use client';

import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import type { ChartType } from '@domio/chart';
import { validateBinding, type BindingSchema } from '@domio/chart';
import {
  getDataSources,
  getRequiredRoles,
  type LiveDataBinding,
} from '../lib/live-data-store';

interface BindInspectorProps {
  binding: LiveDataBinding;
  onChange: (binding: LiveDataBinding) => void;
  chartType?: ChartType;
}

export function BindInspector({ binding, onChange, chartType }: BindInspectorProps): ReactElement {
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
