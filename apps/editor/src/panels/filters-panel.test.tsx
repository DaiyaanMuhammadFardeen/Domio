import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiltersPanel } from './filters-panel';
import type { CrossFilter } from '@domio/canvas';

describe('FiltersPanel', () => {
  const sampleFilters: CrossFilter[] = [
    { id: 'f1', dimension: 'region', value: 'North America' },
    { id: 'f2', dimension: 'month', value: 'Jan' },
  ];

  it('renders the panel title', () => {
    render(<FiltersPanel filters={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Cross-Chart Filters')).toBeInTheDocument();
  });

  it('shows empty state when no filters', () => {
    render(<FiltersPanel filters={[]} onChange={vi.fn()} />);
    const empties = screen.getAllByText('No active filters');
    expect(empties.length).toBeGreaterThanOrEqual(1);
  });

  it('renders existing filters with dimension and value', () => {
    render(<FiltersPanel filters={sampleFilters} onChange={vi.fn()} />);
    const row1 = screen.getByTestId('p08-filter-row-f1');
    const row2 = screen.getByTestId('p08-filter-row-f2');
    expect(row1).toHaveTextContent('region');
    expect(row1).toHaveTextContent('North America');
    expect(row2).toHaveTextContent('month');
    expect(row2).toHaveTextContent('Jan');
  });

  it('shows count of active filters', () => {
    render(<FiltersPanel filters={sampleFilters} onChange={vi.fn()} />);
    expect(screen.getByText('2 active')).toBeInTheDocument();
  });

  it('renders filter rows with data-testid', () => {
    render(<FiltersPanel filters={sampleFilters} onChange={vi.fn()} />);
    expect(screen.getByTestId('p08-filter-row-f1')).toBeInTheDocument();
    expect(screen.getByTestId('p08-filter-row-f2')).toBeInTheDocument();
  });

  it('calls onChange with new filter when adding', () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p08-filter-dimension'), { target: { value: 'region' } });
    fireEvent.change(screen.getByTestId('p08-filter-value'), { target: { value: 'Europe' } });
    fireEvent.click(screen.getByTestId('p08-filter-add'));
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ dimension: 'region', value: 'Europe' })]),
    );
  });

  it('calls onChange without the removed filter when removing', () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={sampleFilters} onChange={onChange} />);
    const removeBtn = screen
      .getByTestId('p08-filter-row-f1')
      .querySelector('[title="Remove filter"]')!;
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'f2' })]),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ id: 'f1' })]),
    );
  });

  it('does not add filter when value is empty', () => {
    const onChange = vi.fn();
    render(<FiltersPanel filters={[]} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p08-filter-dimension'), { target: { value: 'region' } });
    fireEvent.click(screen.getByTestId('p08-filter-add'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
