import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BindInspector, catalogIdToChartType } from './bind-inspector.js';
import { resetStore } from '../lib/live-data-store.js';
import type { LiveDataBinding } from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
});

const emptyBinding: LiveDataBinding = { queryId: null, fieldMap: {}, listenToFilters: [] };

describe('BindInspector', () => {
  it('renders the data binding section', () => {
    render(<BindInspector binding={emptyBinding} onChange={vi.fn()} />);
    expect(screen.getByText('Data Binding')).toBeInTheDocument();
  });

  it('shows source selector with available data sources', () => {
    render(<BindInspector binding={emptyBinding} onChange={vi.fn()} />);
    const select = screen.getByTestId('p08-bind-source');
    expect(select).toBeInTheDocument();
    // Should have "None" plus 3 demo sources
    expect(select.querySelectorAll('option')).toHaveLength(4);
  });

  it('shows field mapping when a source is selected', () => {
    render(<BindInspector binding={{ ...emptyBinding, queryId: 'ds-revenue' }} onChange={vi.fn()} chartType="bar" />);
    expect(screen.getByText('Field Mapping')).toBeInTheDocument();
    expect(screen.getByTestId('p08-bind-field-x')).toBeInTheDocument();
    expect(screen.getByTestId('p08-bind-field-y')).toBeInTheDocument();
  });

  it('calls onChange when source is selected', () => {
    const onChange = vi.fn();
    render(<BindInspector binding={emptyBinding} onChange={onChange} chartType="bar" />);
    fireEvent.change(screen.getByTestId('p08-bind-source'), { target: { value: 'ds-revenue' } });
    expect(onChange).toHaveBeenCalled();
    const newBinding = onChange.mock.calls[0]![0] as LiveDataBinding;
    expect(newBinding.queryId).toBe('ds-revenue');
  });

  it('calls onChange when field mapping changes', () => {
    const onChange = vi.fn();
    render(
      <BindInspector
        binding={{ ...emptyBinding, queryId: 'ds-revenue' }}
        onChange={onChange}
        chartType="bar"
      />,
    );
    fireEvent.change(screen.getByTestId('p08-bind-field-x'), { target: { value: 'month' } });
    expect(onChange).toHaveBeenCalled();
    const newBinding = onChange.mock.calls[0]![0] as LiveDataBinding;
    expect(newBinding.fieldMap.x).toBe('month');
  });

  it('shows valid status when binding is complete and correct', () => {
    const binding: LiveDataBinding = {
      queryId: 'ds-revenue',
      fieldMap: { x: 'month', y: 'revenue' },
      listenToFilters: [],
    };
    render(<BindInspector binding={binding} onChange={vi.fn()} chartType="bar" />);
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('shows invalid status when binding has errors', () => {
    const binding: LiveDataBinding = {
      queryId: 'ds-revenue',
      fieldMap: { x: 'revenue', y: 'month' }, // type mismatch: revenue is number, x expects string
      listenToFilters: [],
    };
    render(<BindInspector binding={binding} onChange={vi.fn()} chartType="bar" />);
    expect(screen.getByText(/error/)).toBeInTheDocument();
  });
});

describe('catalogIdToChartType', () => {
  it('extracts chart type from catalog id', () => {
    expect(catalogIdToChartType('domio.live-bar')).toBe('bar');
    expect(catalogIdToChartType('domio.live-line')).toBe('line');
    expect(catalogIdToChartType('domio.live-scatter')).toBe('scatter');
    expect(catalogIdToChartType('domio.live-gauge')).toBe('gauge');
  });

  it('returns undefined for non-live-chart ids', () => {
    expect(catalogIdToChartType('domio.stat-card')).toBeUndefined();
    expect(catalogIdToChartType('domio.bar-chart')).toBeUndefined();
  });
});
