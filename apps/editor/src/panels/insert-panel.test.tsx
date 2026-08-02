import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { InsertPanel } from './InsertPanel.js';

describe('InsertPanel', () => {
  const grid = () => within(screen.getByTestId('insert-grid'));

  it('lists components from the curated catalog', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    expect(grid().getByText('Stat Card')).toBeInTheDocument();
    expect(grid().getByText('KPI Trio')).toBeInTheDocument();
  });

  it('shows the catalog count', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    expect(screen.getByText(/components/)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search components'), {
      target: { value: 'chart' },
    });
    expect(grid().getByText('Bar Chart')).toBeInTheDocument();
    expect(grid().queryByText('Stat Card')).not.toBeInTheDocument();
  });

  it('filters by category', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
    expect(grid().getByText('Bar Chart')).toBeInTheDocument();
    expect(grid().queryByText('Stat Card')).not.toBeInTheDocument();
  });

  it('fires onInsert with the catalog id when a card is inserted', () => {
    const onInsert = vi.fn();
    render(<InsertPanel onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: /Stat Card/ }));
    expect(onInsert).toHaveBeenCalledWith('domio.stat-card');
  });
});
