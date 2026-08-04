import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThresholdPanel } from './threshold-panel.js';
import type { ThresholdRule } from '../lib/live-data-store.js';

function makeRule(overrides: Partial<ThresholdRule> = {}): ThresholdRule {
  return {
    id: `thr-${Math.random().toString(36).slice(2)}`,
    measure: 'value',
    comparator: 'gt',
    values: [50],
    severity: 'info',
    styleOverride: {},
    ...overrides,
  };
}

describe('ThresholdPanel', () => {
  it('renders the section title', () => {
    render(<ThresholdPanel rules={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Threshold Rules')).toBeInTheDocument();
  });

  it('renders existing rules', () => {
    const rules = [makeRule({ id: 'thr-1', measure: 'revenue', severity: 'warn' })];
    render(<ThresholdPanel rules={rules} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('revenue')).toBeInTheDocument();
  });

  it('adds a new rule when clicking Add rule', () => {
    const onChange = vi.fn();
    render(<ThresholdPanel rules={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('p08-threshold-add'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newRules = onChange.mock.calls[0]![0] as ThresholdRule[];
    expect(newRules).toHaveLength(1);
    expect(newRules[0]!.measure).toBe('value');
    expect(newRules[0]!.comparator).toBe('gt');
  });

  it('removes a rule when clicking the remove button', () => {
    const onChange = vi.fn();
    const rules = [makeRule({ id: 'thr-1' }), makeRule({ id: 'thr-2' })];
    render(<ThresholdPanel rules={rules} onChange={onChange} />);
    const removeButtons = screen.getAllByTestId('p08-threshold-remove');
    fireEvent.click(removeButtons[0]!);
    expect(onChange).toHaveBeenCalledTimes(1);
    const newRules = onChange.mock.calls[0]![0] as ThresholdRule[];
    expect(newRules).toHaveLength(1);
    expect(newRules[0]!.id).toBe('thr-2');
  });

  it('enforces max rules cap', () => {
    const onChange = vi.fn();
    const rules = Array.from({ length: 64 }, (_, i) => makeRule({ id: `thr-${i}` }));
    render(<ThresholdPanel rules={rules} onChange={onChange} maxRules={64} />);
    const addBtn = screen.getByTestId('p08-threshold-add');
    expect(addBtn).toBeDisabled();
    expect(screen.getByText(/Maximum 64 rules reached/)).toBeInTheDocument();
  });

  it('updates rule severity via select', () => {
    const onChange = vi.fn();
    const rules = [makeRule({ id: 'thr-1', severity: 'info' })];
    render(<ThresholdPanel rules={rules} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    // Last select is severity
    const severitySelect = selects[selects.length - 1]!;
    fireEvent.change(severitySelect, { target: { value: 'critical' } });
    expect(onChange).toHaveBeenCalled();
  });
});
