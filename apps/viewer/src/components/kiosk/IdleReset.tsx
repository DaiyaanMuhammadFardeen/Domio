/**
 * IdleReset — countdown ring that fires a reset after inactivity.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Mounts a window-level activity tracker. Every interaction resets the
 * countdown; when the countdown hits zero, `onReset` fires (which the
 * parent uses to navigate back to slide 0). A small ring in the corner
 * shows the remaining time so trade-show operators can see how close
 * the kiosk is to its auto-reset.
 */

'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';

export interface IdleResetProps {
  /** Total reset window in seconds. */
  readonly resetAfterSec: number;
  /** Fires once when the countdown hits zero. */
  readonly onReset: () => void;
  /** Whether the timer is actively counting down. */
  readonly paused?: boolean;
  /** Optional override label. */
  readonly label?: string;
  readonly dataTestId?: string;
}

interface ActivityState {
  lastActivityMs: number;
}

function getNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function IdleReset({
  resetAfterSec,
  onReset,
  paused = false,
  label,
  dataTestId = 'kiosk-idle-reset',
}: IdleResetProps): ReactElement {
  const stateRef = useRef<ActivityState>({ lastActivityMs: getNow() });
  const [remainingSec, setRemainingSec] = useState<number>(resetAfterSec);
  const onResetRef = useRef(onReset);
  const firedRef = useRef(false);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  // Reset internal bookkeeping when the configured window changes.
  useEffect(() => {
    stateRef.current.lastActivityMs = getNow();
    firedRef.current = false;
    setRemainingSec(resetAfterSec);
  }, [resetAfterSec]);

  // Activity listeners.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const markActivity = (): void => {
      stateRef.current.lastActivityMs = getNow();
      firedRef.current = false;
    };
    const events: readonly (keyof WindowEventMap)[] = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'touchstart',
      'touchend',
      'touchmove',
      'keydown',
      'wheel',
    ];
    for (const ev of events) {
      window.addEventListener(ev, markActivity, { passive: true });
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, markActivity);
      }
    };
  }, []);

  // Tick loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (paused) return;

    let raf = 0;
    let cancelled = false;

    const tick = (): void => {
      if (cancelled) return;
      const elapsedMs = getNow() - stateRef.current.lastActivityMs;
      const remaining = Math.max(0, resetAfterSec - Math.floor(elapsedMs / 1000));
      setRemainingSec(remaining);
      if (remaining <= 0) {
        if (!firedRef.current) {
          firedRef.current = true;
          // Fire after the state update so the UI shows "0" briefly.
          onResetRef.current();
        }
      } else {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [resetAfterSec, paused]);

  // Stroke-dasharray ring math.
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const pct = resetAfterSec > 0 ? remainingSec / resetAfterSec : 0;
  const dashOffset = circumference * (1 - pct);
  const display = label ?? (paused ? '—' : `${remainingSec}s`);

  return (
    <div
      data-testid={dataTestId}
      data-remaining-sec={remainingSec}
      data-paused={paused ? 'true' : 'false'}
      aria-label="Idle reset countdown"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 56,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
        pointerEvents: 'none',
        fontFamily: 'system-ui',
        fontSize: 11,
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      <svg
        width={56}
        height={56}
        viewBox="0 0 56 56"
        data-testid={`${dataTestId}-ring`}
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={3}
        />
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke="rgba(56,189,248,0.9)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          data-testid={`${dataTestId}-progress`}
        />
      </svg>
      <span
        data-testid={`${dataTestId}-label`}
        style={{ position: 'relative', fontVariantNumeric: 'tabular-nums' }}
      >
        {display}
      </span>
    </div>
  );
}
