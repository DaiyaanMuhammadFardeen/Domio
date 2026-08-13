/**
 * OptOutToggle tests.
 *
 * Per Wave 5 §S5.4 spec:
 *   render with optOut=false → click → verify onChange(true) and cookie written
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptOutToggle, ATTENDANCE_OPT_OUT_COOKIE, writeCookie } from './OptOutToggle';

function readCookie(key: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(key)}=`;
  const entries = document.cookie.split(';').map((s) => s.trim());
  for (const e of entries) {
    if (e.startsWith(prefix)) {
      return decodeURIComponent(e.slice(prefix.length));
    }
  }
  return null;
}

describe('OptOutToggle', () => {
  it('renders opt-out state when optOut=false (tracking)', () => {
    render(<OptOutToggle optOut={false} onChange={() => undefined} />);
    const btn = screen.getByTestId('attendance-optout-toggle');
    expect(btn).toHaveAttribute('aria-checked', 'false');
    expect(btn).toHaveTextContent(/Tracking attendance/i);
  });

  it('renders paused state when optOut=true', () => {
    render(<OptOutToggle optOut={true} onChange={() => undefined} />);
    const btn = screen.getByTestId('attendance-optout-toggle');
    expect(btn).toHaveAttribute('aria-checked', 'true');
    expect(btn).toHaveTextContent(/Attendance paused/i);
  });

  it('clicking while optOut=false fires onChange(true) and writes cookie=1', () => {
    const onChange = vi.fn();
    document.cookie = `${encodeURIComponent(ATTENDANCE_OPT_OUT_COOKIE)}=; Path=/; Max-Age=0`;
    render(<OptOutToggle optOut={false} onChange={onChange} />);
    const btn = screen.getByTestId('attendance-optout-toggle');
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(readCookie(ATTENDANCE_OPT_OUT_COOKIE)).toBe('1');
  });

  it('clicking while optOut=true fires onChange(false) and writes cookie=0', () => {
    const onChange = vi.fn();
    render(<OptOutToggle optOut={true} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('attendance-optout-toggle'));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(readCookie(ATTENDANCE_OPT_OUT_COOKIE)).toBe('0');
  });

  it('writeCookie is a no-op outside a browser', () => {
    expect(() => writeCookie('x', 'y', 1)).not.toThrow();
  });
});
