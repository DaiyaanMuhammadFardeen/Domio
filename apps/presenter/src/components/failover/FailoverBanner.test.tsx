/**
 * FailoverBanner tests — S4.8.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FailoverBanner } from './FailoverBanner';

describe('FailoverBanner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the reconnecting state with a countdown', () => {
    render(<FailoverBanner state="reconnecting" reconnectDeadlineMs={10_000} />);
    expect(screen.getByTestId('failover-banner').getAttribute('data-state')).toBe('reconnecting');
    expect(screen.getByText(/Presenter reconnecting/i)).toBeInTheDocument();
  });

  it('renders the lost state', () => {
    render(<FailoverBanner state="lost" />);
    expect(screen.getByTestId('failover-banner').getAttribute('data-state')).toBe('lost');
    expect(screen.getByText(/Session lost/i)).toBeInTheDocument();
  });

  it('renders nothing when state is resumed', () => {
    render(<FailoverBanner state="resumed" />);
    expect(screen.queryByTestId('failover-banner')).toBeNull();
  });

  it('counts down the reconnect deadline', () => {
    render(<FailoverBanner state="reconnecting" reconnectDeadlineMs={3_000} />);
    expect(screen.getByText(/3s/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.getByText(/2s/)).toBeInTheDocument();
  });

  it('fires onDismiss when the dismiss button is clicked in lost state', () => {
    const onDismiss = vi.fn();
    render(<FailoverBanner state="lost" onDismiss={onDismiss} />);
    screen.getByTestId('failover-banner-dismiss').click();
    expect(onDismiss).toHaveBeenCalled();
  });
});
