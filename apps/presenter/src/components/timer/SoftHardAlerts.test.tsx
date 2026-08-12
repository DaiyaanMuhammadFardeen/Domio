/**
 * SoftHardAlerts tests — S4.11.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SoftHardAlerts } from './SoftHardAlerts';

describe('SoftHardAlerts', () => {
  it('renders nothing when the level is safe', () => {
    const { container } = render(<SoftHardAlerts level="safe" message="ok" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a polite status overlay for the soft level', () => {
    render(<SoftHardAlerts level="soft" message="Wrapping up in 30s" />);
    const overlay = screen.getByTestId('soft-hard-alerts');
    expect(overlay).toHaveAttribute('data-level', 'soft');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveTextContent(/Wrapping up in 30s/);
  });

  it('renders an assertive alert overlay for the hard level', () => {
    render(<SoftHardAlerts level="hard" message="Time is up!" />);
    const overlay = screen.getByTestId('soft-hard-alerts');
    expect(overlay).toHaveAttribute('data-level', 'hard');
    expect(overlay).toHaveAttribute('role', 'alert');
    expect(overlay).toHaveAttribute('aria-live', 'assertive');
    expect(overlay).toHaveTextContent(/Time is up!/);
  });

  it('dismisses the overlay when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<SoftHardAlerts level="hard" message="Time is up!" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('soft-hard-alerts-dismiss'));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByTestId('soft-hard-alerts')).toBeNull();
  });
});
