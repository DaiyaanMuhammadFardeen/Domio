/**
 * InsertPanel — Wave 2 §S2.4 unit tests.
 *
 * The panel is now tab-driven (Components / Templates / Sections /
 * Stock / Lottie / Stickers / Icons). These tests cover the
 * Components tab (search/category/variant) plus the basic tab
 * navigation surface so other tabs render without crashing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { InsertPanel } from './InsertPanel.js';

describe('InsertPanel', () => {
  const grid = () => within(screen.getByTestId('insert-grid'));

  it('renders the outer tab strip', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    expect(screen.getByTestId('insert-tab-components')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-templates')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-sections')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-stock')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-lottie')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-stickers')).toBeInTheDocument();
    expect(screen.getByTestId('insert-tab-icons')).toBeInTheDocument();
  });

  it('lists components from the curated catalog (Components tab is default)', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    expect(grid().getByText('Stat Card')).toBeInTheDocument();
    expect(grid().getByText('KPI Trio')).toBeInTheDocument();
  });

  it('shows the panel subtitle (not the raw component count)', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    expect(screen.getByText(/Components, templates/i)).toBeInTheDocument();
  });

  it('filters by search query', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search components…'), {
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

  it('switches to the Templates tab and renders template cards', () => {
    render(<InsertPanel onInsert={vi.fn()} onInsertTemplate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-templates'));
    const grid = screen.getByTestId('insert-templates');
    expect(within(grid).getByText('Investor Pitch')).toBeInTheDocument();
    expect(within(grid).getAllByText('Board Report').length).toBeGreaterThan(0);
  });

  it('switches to the Sections tab and renders section cards', () => {
    render(<InsertPanel onInsert={vi.fn()} onInsertSection={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-sections'));
    const grid = screen.getByTestId('insert-sections');
    expect(within(grid).getByText('Team')).toBeInTheDocument();
    expect(within(grid).getByText('Financials')).toBeInTheDocument();
  });

  it('renders the Stock tab with the local fallback', async () => {
    render(<InsertPanel onInsert={vi.fn()} onInsertStockImage={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-stock'));
    const grid = await screen.findByTestId('insert-stock-grid');
    expect(within(grid).getByText('Modern office')).toBeInTheDocument();
    expect(screen.getByText(/Showing local catalog/)).toBeInTheDocument();
  });

  it('renders the Lottie tab with the local fallback', async () => {
    render(<InsertPanel onInsert={vi.fn()} onInsertLottie={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-lottie'));
    const grid = await screen.findByTestId('insert-lottie-grid');
    expect(within(grid).getByText('Checkmark success')).toBeInTheDocument();
  });

  it('switches to Stickers tab and renders packs', () => {
    render(<InsertPanel onInsert={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-stickers'));
    expect(screen.getByTestId('insert-sticker-grid')).toBeInTheDocument();
  });

  it('switches to Icons tab and renders the icon grid', () => {
    render(<InsertPanel onInsert={vi.fn()} onInsertIcon={vi.fn()} />);
    fireEvent.click(screen.getByTestId('insert-tab-icons'));
    expect(screen.getByTestId('insert-icon-grid')).toBeInTheDocument();
  });
});
