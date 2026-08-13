/**
 * KioskSurface tests — S5.8.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { KioskSurface } from './KioskSurface';

describe('KioskSurface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Remove any query string the test environment may have set.
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the surface + PIN pad when locked', () => {
    render(
      <KioskSurface sessionId="sess-1" adminPin="1234" idleMs={30_000} autoResetMs={300_000} />,
    );
    expect(screen.getByTestId('kiosk-surface')).toHaveAttribute('data-unlocked', 'false');
    expect(screen.getByTestId('kiosk-pin-input')).toBeInTheDocument();
    expect(screen.getByTestId('kiosk-pin-submit')).toBeInTheDocument();
  });

  it('unlocks when the correct PIN is entered', () => {
    render(<KioskSurface sessionId="sess-1" adminPin="1234" />);
    fireEvent.change(screen.getByTestId('kiosk-pin-input'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('kiosk-pin-submit'));
    expect(screen.getByTestId('kiosk-surface')).toHaveAttribute('data-unlocked', 'true');
  });

  it('shows an error when the wrong PIN is entered', () => {
    render(<KioskSurface sessionId="sess-1" adminPin="1234" />);
    fireEvent.change(screen.getByTestId('kiosk-pin-input'), { target: { value: '9999' } });
    fireEvent.click(screen.getByTestId('kiosk-pin-submit'));
    expect(screen.getByTestId('kiosk-pin-error')).toHaveTextContent(/Invalid PIN/);
    expect(screen.getByTestId('kiosk-surface')).toHaveAttribute('data-unlocked', 'false');
  });

  it('unlocks on first paint when ?pin=<correct> is in the URL', () => {
    const originalLocation = window.location;
    const target = new URL('http://localhost/?pin=1234');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: target,
    });
    try {
      render(<KioskSurface sessionId="sess-1" adminPin="1234" />);
      expect(screen.getByTestId('kiosk-surface')).toHaveAttribute('data-unlocked', 'true');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    }
  });

  it('shows the IdleScreen overlay after 30 s of inactivity', () => {
    render(
      <KioskSurface sessionId="sess-1" adminPin="1234" idleMs={30_000} autoResetMs={300_000} />,
    );
    // Unlock first so we can see the idle overlay on top of children.
    fireEvent.change(screen.getByTestId('kiosk-pin-input'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('kiosk-pin-submit'));
    expect(screen.queryByTestId('kiosk-idle-screen')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('kiosk-idle-screen')).toBeInTheDocument();
  });

  it('clicking the IdleScreen hides the overlay', () => {
    render(
      <KioskSurface sessionId="sess-1" adminPin="1234" idleMs={30_000} autoResetMs={300_000} />,
    );
    fireEvent.change(screen.getByTestId('kiosk-pin-input'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('kiosk-pin-submit'));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('kiosk-idle-screen')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kiosk-idle-screen'));
    expect(screen.queryByTestId('kiosk-idle-screen')).toBeNull();
  });

  it('fires onReset after the auto-reset window', () => {
    const onReset = vi.fn();
    render(
      <KioskSurface
        sessionId="sess-1"
        adminPin="1234"
        idleMs={30_000}
        autoResetMs={1_000}
        onReset={onReset}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
