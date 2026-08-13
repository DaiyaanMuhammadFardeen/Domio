/**
 * OfflineCache tests — S4.9.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfflineCache } from './OfflineCache';

describe('OfflineCache', () => {
  it('renders nothing when status is online', () => {
    const { container } = render(<OfflineCache status="online" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a preparing banner with progress percentage', () => {
    render(<OfflineCache status="preparing" cachedSlideCount={3} totalSlideCount={10} />);
    const banner = screen.getByTestId('offline-cache');
    expect(banner).toHaveAttribute('data-status', 'preparing');
    expect(banner).toHaveTextContent(/Caching deck 30%/);
    expect(banner).toHaveTextContent(/\(3\/10\)/);
  });

  it('handles 0/0 without dividing by zero', () => {
    render(<OfflineCache status="preparing" cachedSlideCount={0} totalSlideCount={0} />);
    expect(screen.getByTestId('offline-cache')).toHaveTextContent(/Caching deck 0%/);
  });

  it('renders the offline banner with reconnect button', () => {
    const onReconnect = vi.fn();
    render(<OfflineCache status="offline" onReconnect={onReconnect} />);
    const banner = screen.getByTestId('offline-cache');
    expect(banner).toHaveAttribute('data-status', 'offline');
    expect(banner).toHaveTextContent(/Offline — running from cached snapshot\./);
    const btn = screen.getByTestId('offline-cache-reconnect');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('renders the stale banner with reconnect button', () => {
    const onReconnect = vi.fn();
    render(<OfflineCache status="stale" onReconnect={onReconnect} />);
    const banner = screen.getByTestId('offline-cache');
    expect(banner).toHaveAttribute('data-status', 'stale');
    expect(banner).toHaveTextContent(/Reconnecting — running from last good snapshot\./);
    fireEvent.click(screen.getByTestId('offline-cache-reconnect'));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not render a reconnect button when onReconnect is not provided', () => {
    render(<OfflineCache status="offline" />);
    expect(screen.queryByTestId('offline-cache-reconnect')).not.toBeInTheDocument();
  });
});
