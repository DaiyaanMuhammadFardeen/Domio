/**
 * BindInspector — Wave 2 §S2.7 surface: last-synced timestamp +
 * drag-and-drop column rebinding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BindInspector } from './bind-inspector.js';
import { resetStore } from '../lib/live-data-store.js';
import type { LiveDataBinding } from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
});

const baseBinding: LiveDataBinding = {
  queryId: 'ds-revenue',
  fieldMap: { x: 'month', y: 'revenue' },
  listenToFilters: [],
};

describe('BindInspector — last-synced timestamp', () => {
  it('shows a relative last-synced timestamp when a source is bound', () => {
    render(<BindInspector binding={baseBinding} onChange={vi.fn()} chartType="bar" />);
    expect(screen.getByTestId('p08-bind-last-synced')).toBeInTheDocument();
    expect(screen.getByTestId('p08-bind-last-synced')).toHaveTextContent(/ago/);
  });

  it('does not show last-synced when no source is bound', () => {
    render(
      <BindInspector
        binding={{ queryId: null, fieldMap: {}, listenToFilters: [] }}
        onChange={vi.fn()}
        chartType="bar"
      />,
    );
    expect(screen.queryByTestId('p08-bind-last-synced')).toBeNull();
  });
});

describe('BindInspector — drag-and-drop rebinding', () => {
  it('renders the column palette with draggable chips', () => {
    render(<BindInspector binding={baseBinding} onChange={vi.fn()} chartType="bar" />);
    expect(screen.getByTestId('p08-bind-column-palette')).toBeInTheDocument();
    expect(screen.getByTestId('p08-bind-chip-month')).toBeInTheDocument();
    expect(screen.getByTestId('p08-bind-chip-revenue')).toBeInTheDocument();
  });

  it('emits onChange when a column chip is dropped onto a role', () => {
    const onChange = vi.fn();
    render(<BindInspector binding={baseBinding} onChange={onChange} chartType="bar" />);
    const chip = screen.getByTestId('p08-bind-chip-revenue');
    const select = screen.getByTestId('p08-bind-field-x');
    const dataTransfer = { 'text/domio-column': 'revenue' };
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.dragOver(select, { dataTransfer });
    fireEvent.drop(select, { dataTransfer });
    expect(onChange).toHaveBeenCalled();
    const newBinding = onChange.mock.calls[0]![0] as LiveDataBinding;
    expect(newBinding.fieldMap.x).toBe('revenue');
  });
});
