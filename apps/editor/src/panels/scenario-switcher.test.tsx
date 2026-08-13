import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioSwitcher } from './scenario-switcher.js';
import {
  resetStore,
  getScenarios,
  getActiveScenarioId,
  createScenario,
} from '../lib/live-data-store.js';

beforeEach(() => {
  resetStore();
});

describe('ScenarioSwitcher', () => {
  it('renders the active scenario name', () => {
    render(<ScenarioSwitcher />);
    expect(screen.getByTestId('p08-scenario-btn')).toHaveTextContent('Base');
  });

  it('opens the dropdown when clicking the button', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    expect(screen.getByTestId('p08-scenario-dropdown')).toBeInTheDocument();
  });

  it('lists the base scenario with Base badge', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    const baseItem = screen.getByTestId('p08-scenario-item-scenario-base');
    expect(baseItem).toHaveTextContent('Base');
    expect(baseItem).toHaveClass('is-active');
  });

  it('shows the create scenario button', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    expect(screen.getByTestId('p08-scenario-create-btn')).toBeInTheDocument();
  });

  it('creates a new scenario', () => {
    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    fireEvent.click(screen.getByTestId('p08-scenario-create-btn'));

    const input = screen.getByTestId('p08-scenario-create-input');
    fireEvent.change(input, { target: { value: 'Q3 Forecast' } });
    fireEvent.click(screen.getByTestId('p08-scenario-create-confirm'));

    // The new scenario should now be in the store
    const scenarios = getScenarios();
    expect(scenarios.length).toBe(2);
    expect(scenarios[1]!.name).toBe('Q3 Forecast');
    expect(scenarios[1]!.parentId).toBe('scenario-base');
  });

  it('switches active scenario', () => {
    // Pre-create a scenario in the store
    createScenario('Alt', 'scenario-base');

    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));

    // Click the "Alt" scenario
    const altButton = screen.getByText('Alt');
    fireEvent.click(altButton);

    expect(getActiveScenarioId()).not.toBe('scenario-base');
  });

  it('shows derived label for non-base scenarios', () => {
    // Pre-create a derived scenario in the store
    createScenario('Derived', 'scenario-base');

    render(<ScenarioSwitcher />);
    fireEvent.click(screen.getByTestId('p08-scenario-btn'));
    expect(screen.getByText(/derived from Base/)).toBeInTheDocument();
  });
});
