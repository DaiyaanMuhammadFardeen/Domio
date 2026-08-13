/**
 * AutoReset — idle-detection hook for the kiosk surface.
 *
 * Per Wave 5 §S5.8 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Tracks pointer + touch activity on `window`. After `timeoutMs` of
 * inactivity `onIdle` fires. Exposes a `reset()` API the parent can
 * invoke when the user wakes the kiosk (e.g. taps the idle overlay).
 *
 *  useAutoReset(30_000, () => setIdle(true))
 *    → { lastActivity, reset }
 *
 * The returned `lastActivity` is a number (epoch ms) so renderers
 * can surface "last touch 12 s ago" if they want.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAutoResetResult {
  readonly lastActivity: number;
  readonly reset: () => void;
}

export function useAutoReset(
  timeoutMs: number,
  onIdle: () => void,
): UseAutoResetResult {
  const [lastActivity, setLastActivity] = useState<number>(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const schedule = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (timeoutMs <= 0) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onIdleRef.current();
    }, timeoutMs);
  }, [timeoutMs]);

  const reset = useCallback(() => {
    setLastActivity(Date.now());
    schedule();
  }, [schedule]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ping = () => {
      setLastActivity(Date.now());
      schedule();
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', ping, opts);
    window.addEventListener('pointermove', ping, opts);
    window.addEventListener('touchstart', ping, opts);
    window.addEventListener('keydown', ping, opts);
    schedule();
    return () => {
      window.removeEventListener('pointerdown', ping);
      window.removeEventListener('pointermove', ping);
      window.removeEventListener('touchstart', ping);
      window.removeEventListener('keydown', ping);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [schedule]);

  return { lastActivity, reset };
}
