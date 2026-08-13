/**
 * TimeBudgetAlerts tests — S4.13.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeBudgetAlerts } from './TimeBudgetAlerts';

describe('TimeBudgetAlerts', () => {
  it('renders with level=safe when dwell/budget < soft threshold', () => {
    render(<TimeBudgetAlerts dwellMs={5_000} budgetMs={60_000} />);
    const bar = screen.getByTestId('time-budget-alerts');
    expect(bar).toHaveAttribute('data-level', 'safe');
    expect(bar).toHaveAttribute('data-pct', '0.08');
  });

  it('marks level=soft between 80% and 100%', () => {
    render(<TimeBudgetAlerts dwellMs={50_000} budgetMs={60_000} />);
    expect(screen.getByTestId('time-budget-alerts')).toHaveAttribute('data-level', 'soft');
  });

  it('marks level=hard at or beyond 100%', () => {
    render(<TimeBudgetAlerts dwellMs={65_000} budgetMs={60_000} />);
    expect(screen.getByTestId('time-budget-alerts')).toHaveAttribute('data-level', 'hard');
  });

  it('fires onSoftAlert exactly once per entry into the soft band', () => {
    const onSoftAlert = vi.fn();
    const onHardAlert = vi.fn();
    const { rerender } = render(
      <TimeBudgetAlerts dwellMs={5_000} budgetMs={60_000} onSoftAlert={onSoftAlert} />,
    );
    expect(onSoftAlert).not.toHaveBeenCalled();

    // Enter soft band.
    rerender(<TimeBudgetAlerts dwellMs={50_000} budgetMs={60_000} onSoftAlert={onSoftAlert} />);
    expect(onSoftAlert).toHaveBeenCalledTimes(1);

    // Stay in soft band — no duplicate call.
    rerender(<TimeBudgetAlerts dwellMs={55_000} budgetMs={60_000} onSoftAlert={onSoftAlert} />);
    expect(onSoftAlert).toHaveBeenCalledTimes(1);

    // Leave (drop back to safe) — armed again.
    rerender(<TimeBudgetAlerts dwellMs={5_000} budgetMs={60_000} onSoftAlert={onSoftAlert} />);
    rerender(<TimeBudgetAlerts dwellMs={50_000} budgetMs={60_000} onSoftAlert={onSoftAlert} />);
    expect(onSoftAlert).toHaveBeenCalledTimes(2);

    // Exercise the unused warning for onHardAlert by referencing it.
    expect(onHardAlert).toBeDefined();
  });

  it('fires onHardAlert when crossing 100%', () => {
    const onHardAlert = vi.fn();
    const { rerender } = render(
      <TimeBudgetAlerts dwellMs={50_000} budgetMs={60_000} onHardAlert={onHardAlert} />,
    );
    rerender(<TimeBudgetAlerts dwellMs={65_000} budgetMs={60_000} onHardAlert={onHardAlert} />);
    expect(onHardAlert).toHaveBeenCalledTimes(1);
  });

  it('respects custom soft/hard thresholds', () => {
    const { rerender } = render(
      <TimeBudgetAlerts
        dwellMs={30_000}
        budgetMs={60_000}
        thresholds={{ softPct: 0.4, hardPct: 0.6 }}
      />,
    );
    // 30s/60s = 0.5 → soft per override (above 40% but below 60%).
    expect(screen.getByTestId('time-budget-alerts')).toHaveAttribute('data-level', 'soft');

    rerender(
      <TimeBudgetAlerts
        dwellMs={40_000}
        budgetMs={60_000}
        thresholds={{ softPct: 0.4, hardPct: 0.6 }}
      />,
    );
    expect(screen.getByTestId('time-budget-alerts')).toHaveAttribute('data-level', 'hard');
  });

  it('handles zero budget without dividing by zero', () => {
    render(<TimeBudgetAlerts dwellMs={5_000} budgetMs={0} />);
    expect(screen.getByTestId('time-budget-alerts')).toHaveAttribute('data-level', 'safe');
  });
});
