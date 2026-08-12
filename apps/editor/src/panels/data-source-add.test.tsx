/**
 * DataSourcePanel — Wave 2 §S2.7 add-source flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DataSourcePanel } from './data-source-panel.js';
import { resetStore } from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
  vi.restoreAllMocks();
  // Reset fetch to a default offline mock for tests that don't override it
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
});

describe('DataSourcePanel — add-source form', () => {
  it('renders the connect button by default', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    expect(screen.getByTestId('data-panel-add-btn')).toBeInTheDocument();
  });

  it('opens the connector form when the button is clicked', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    expect(screen.getByTestId('data-panel-add-form')).toBeInTheDocument();
  });

  it('lists the connector catalog in the kind selector', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    const sel = screen.getByTestId('ds-connector-select') as HTMLSelectElement;
    const values = Array.from(sel.querySelectorAll('option')).map((o) => o.value);
    expect(values).toContain('sheets');
    expect(values).toContain('postgres');
    expect(values).toContain('bigquery');
    expect(values).toContain('mock');
  });

  it('shows a connector description', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    expect(screen.getByTestId('ds-connector-desc')).toBeInTheDocument();
  });

  it('closes the form when Cancel is clicked', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    fireEvent.click(screen.getByTestId('ds-add-cancel'));
    expect(screen.queryByTestId('data-panel-add-form')).toBeNull();
  });

  it('submits the form and adds a mock source', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    fireEvent.change(screen.getByTestId('ds-name-input'), {
      target: { value: 'MyMock' },
    });
    fireEvent.click(screen.getByTestId('ds-add-submit'));
    await waitFor(() => {
      expect(screen.queryByTestId('data-panel-add-form')).toBeNull();
    });
  });

  it('shows a validation error for required Postgres credentials', () => {
    render(<DataSourcePanel selectedSourceId={null} onSelectSource={vi.fn()} />);
    fireEvent.click(screen.getByTestId('data-panel-add-btn'));
    // Switch to postgres
    fireEvent.change(screen.getByTestId('ds-connector-select'), { target: { value: 'postgres' } });
    fireEvent.click(screen.getByTestId('ds-add-submit'));
    expect(screen.getByTestId('ds-add-error')).toHaveTextContent(/Connection string/);
  });
});