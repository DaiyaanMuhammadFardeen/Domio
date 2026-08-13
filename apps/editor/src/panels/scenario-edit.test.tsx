/**
 * ScenarioSwitcher — Wave 2 §S2.7 edit-binding flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScenarioSwitcher } from './scenario-switcher.js';
import { resetStore } from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn();
});

describe('ScenarioSwitcher — edit bindings', () => {
  it('renders the scenario button and dropdown', () => {
    render(<ScenarioSwitcher />);
    expect(screen.getByTestId('p08-scenario-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    expect(screen.getByTestId('p08-scenario-dropdown')).toBeInTheDocument();
  });

  it('opens the edit-bindings form when the edit button is clicked', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    expect(screen.getByTestId('p08-scenario-edit-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('p08-scenario-edit-btn'));
    expect(screen.getByTestId('p08-scenario-edit-form')).toBeInTheDocument();
  });

  it('lists data sources in the edit-bindings source selector', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    fireEvent.click(screen.getByTestId('p08-scenario-edit-btn'));
    const sel = screen.getByTestId('p08-scenario-edit-source') as HTMLSelectElement;
    const options = Array.from(sel.querySelectorAll('option'));
    const values = options.map((o) => o.value);
    expect(values).toContain('ds-revenue');
    expect(values).toContain('ds-users');
    expect(values).toContain('ds-pipeline');
  });

  it('POSTs to /v1/scenario/{id}/bindings when Apply is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    fireEvent.click(screen.getByTestId('p08-scenario-edit-btn'));
    fireEvent.change(screen.getByTestId('p08-scenario-edit-source'), {
      target: { value: 'ds-revenue' },
    });
    fireEvent.click(screen.getByTestId('p08-scenario-edit-apply'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('/v1/scenario/scenario-base/bindings');
  });

  it('closes the edit form when Cancel is clicked', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    fireEvent.click(screen.getByTestId('p08-scenario-edit-btn'));
    fireEvent.click(screen.getByTestId('p08-scenario-edit-cancel'));
    expect(screen.queryByTestId('p08-scenario-edit-form')).toBeNull();
  });
});
