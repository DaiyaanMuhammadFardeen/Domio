/**
 * @domio/join-web — attendance opt-out toggle.
 *
 * Per Wave 5 §S5.4 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Privacy: writes the user's preference to the `domio-attendance-optout`
 * cookie (string '1' for opted out, '0' for opted in). The cookie is
 * readable on subsequent joins, so the server can short-circuit
 * attendance / engagement tracking when the participant has opted out.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export const ATTENDANCE_OPT_OUT_COOKIE = 'domio-attendance-optout';

export interface OptOutToggleProps {
  /** Controlled value — current opt-out state. */
  readonly optOut: boolean;
  /** Fired when the user flips the toggle. */
  readonly onChange: (next: boolean) => void;
  /** Days until the cookie expires. Default 365. */
  readonly cookieMaxAgeDays?: number;
}

/** Write a cookie with the given key + value. Browser-only. */
export function writeCookie(key: string, value: string, maxAgeDays: number): void {
  if (typeof document === 'undefined') return;
  const maxAge = Math.max(0, Math.floor(maxAgeDays)) * 24 * 60 * 60;
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function OptOutToggle(props: OptOutToggleProps) {
  const { optOut, onChange, cookieMaxAgeDays = 365 } = props;
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const handleClick = useCallback(() => {
    const next = !optOut;
    writeCookie(ATTENDANCE_OPT_OUT_COOKIE, next ? '1' : '0', cookieMaxAgeDays);
    onChange(next);
  }, [optOut, onChange, cookieMaxAgeDays]);

  // Use the controlled value after hydration so SSR + client agree on the
  // initial render and we don't toggle on the server.
  const display = hydrated ? optOut : false;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={display}
      onClick={handleClick}
      className={[
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
        display
          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          : 'bg-blue-600 text-white hover:bg-blue-700',
      ].join(' ')}
      data-testid="attendance-optout-toggle"
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block h-2 w-2 rounded-full',
          display ? 'bg-slate-500' : 'bg-white',
        ].join(' ')}
      />
      {display ? 'Attendance paused' : 'Tracking attendance'}
    </button>
  );
}

export default OptOutToggle;
