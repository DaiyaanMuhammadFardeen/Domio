/**
 * ThresholdPanel — renders threshold rules inside PropsPanel
 * for live chart components. Supports add/remove up to 64 rules.
 *
 * P08 — live data & interactive charts.
 */

'use client';

import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { type ThresholdRule } from '../lib/live-data-store';

interface ThresholdPanelProps {
  rules: ThresholdRule[];
  onChange: (rules: ThresholdRule[]) => void;
  maxRules?: number;
}

const COMPARATORS: Array<{ value: ThresholdRule['comparator']; label: string }> = [
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'eq', label: '=' },
  { value: 'between', label: 'between' },
  { value: 'outside', label: 'outside' },
];

const SEVERITIES: Array<{ value: ThresholdRule['severity']; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

function nextId(): string {
  return `thr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ThresholdPanel({ rules, onChange, maxRules = 64 }: ThresholdPanelProps): ReactElement {
  const addRule = useCallback(() => {
    if (rules.length >= maxRules) return;
    const rule: ThresholdRule = {
      id: nextId(),
      measure: 'value',
      comparator: 'gt',
      values: [0],
      severity: 'info',
      styleOverride: {},
    };
    onChange([...rules, rule]);
  }, [rules, onChange, maxRules]);

  const removeRule = useCallback(
    (id: string) => {
      onChange(rules.filter((r) => r.id !== id));
    },
    [rules, onChange],
  );

  const updateRule = useCallback(
    (id: string, patch: Partial<ThresholdRule>) => {
      onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [rules, onChange],
  );

  const atMax = rules.length >= maxRules;

  return (
    <div className="threshold-panel" data-testid="p08-threshold-panel">
      <div className="props-panel__section-title">Threshold Rules</div>

      {rules.map((rule) => (
        <div key={rule.id} className="threshold-row" data-testid={`p08-threshold-row-${rule.id}`}>
          <input
            type="text"
            value={rule.measure}
            placeholder="measure"
            onChange={(e) => updateRule(rule.id, { measure: e.target.value })}
            title="Measure field"
          />
          <select
            value={rule.comparator}
            onChange={(e) =>
              updateRule(rule.id, {
                comparator: e.target.value as ThresholdRule['comparator'],
              })
            }
          >
            {COMPARATORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={rule.values.join(', ')}
            placeholder="value"
            onChange={(e) => {
              const nums = e.target.value
                .split(',')
                .map((s) => parseFloat(s.trim()))
                .filter((n) => !Number.isNaN(n));
              updateRule(rule.id, { values: nums });
            }}
            title="Values (comma-separated)"
          />
          <select
            value={rule.severity}
            onChange={(e) =>
              updateRule(rule.id, {
                severity: e.target.value as ThresholdRule['severity'],
              })
            }
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="threshold-row__remove"
            onClick={() => removeRule(rule.id)}
            aria-label="Remove rule"
            data-testid="p08-threshold-remove"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="prop-control__add"
        onClick={addRule}
        disabled={atMax}
        data-testid="p08-threshold-add"
      >
        + Add rule
      </button>

      {atMax && (
        <div className="prop-field__hint">
          Maximum {maxRules} rules reached
        </div>
      )}
    </div>
  );
}

export type { ThresholdPanelProps };
