import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataSourcePanel } from './data-source-panel.js';
import { resetStore } from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
});

describe('DataSourcePanel', () => {
  it('renders the panel title and source count', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    expect(screen.getByText('Data Sources')).toBeInTheDocument();
    expect(screen.getByText(/sources/)).toBeInTheDocument();
  });

  it('lists demo data sources with mock badge', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    expect(screen.getByText('Revenue Metrics')).toBeInTheDocument();
    expect(screen.getByText('User Analytics')).toBeInTheDocument();
    expect(screen.getByText('Sales Pipeline')).toBeInTheDocument();
    // Check for mock badges
    const mockBadges = screen.getAllByText('Mock');
    expect(mockBadges.length).toBeGreaterThanOrEqual(3);
  });

  it('shows row counts for each source', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    expect(screen.getByText('24 rows')).toBeInTheDocument();
    expect(screen.getByText('50 rows')).toBeInTheDocument();
    expect(screen.getByText('30 rows')).toBeInTheDocument();
  });

  it('highlights the selected source', () => {
    render(<DataSourcePanel selectedSourceId="ds-revenue" onSelectSource={vi.fn()} />);
    const btn = screen.getByTestId('p08-source-ds-revenue');
    expect(btn.className).toContain('is-selected');
  });

  it('calls onSelectSource when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={onSelect} />);
    fireEvent.click(screen.getByTestId('p08-source-ds-revenue'));
    expect(onSelect).toHaveBeenCalledWith('ds-revenue');
  });

  it('deselects when clicking the same source again', () => {
    const onSelect = vi.fn();
    render(<DataSourcePanel selectedSourceId="ds-revenue" onSelectSource={onSelect} />);
    fireEvent.click(screen.getByTestId('p08-source-ds-revenue'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows the add mock dataset form', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Seed')).toBeInTheDocument();
    expect(screen.getByLabelText('Rows')).toBeInTheDocument();
    expect(screen.getByTestId('p08-add-dataset-btn')).toBeInTheDocument();
  });

  it('adds a new mock dataset when clicking Add', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Data' } });
    fireEvent.click(screen.getByTestId('p08-add-dataset-btn'));
    expect(screen.getByText('Test Data')).toBeInTheDocument();
  });

  it('shows freshness dots', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    const dots = document.querySelectorAll('.freshness-dot--fresh');
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });
});
