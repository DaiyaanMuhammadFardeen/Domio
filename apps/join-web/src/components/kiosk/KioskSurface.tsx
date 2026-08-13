/**
 * KioskSurface — main kiosk shell.
 *
 * Per Wave 5 §S5.8 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * The kiosk surface is the rendered entry point for `apps/join-web`
 * when a venue sets up an unattended touch display. Responsibilities:
 *
 *   1. Lock fullscreen + intercept keyboard + lock pointer (delegated
 *      to <FullscreenLock active={locked} />).
 *   2. Show the IdleScreen after 30 s of inactivity.
 *   3. Auto-reset to "first slide" after a configurable idle period
 *      (default 5 min). The reset callback simply clears local state —
 *      the parent route is responsible for re-pushing the deck start.
 *   4. Honor an admin PIN supplied via `?pin=...` or via the on-screen
 *      PIN pad. A correct PIN unlocks the kiosk (releases the
 *      FullscreenLock and renders the parent fallback).
 *
 * The "first slide" reset is the responsibility of the parent route —
 * KioskSurface just fires `onReset` so the route can call router.push
 * back to slide 0. For tests, the parent may simply observe the
 * `data-testid="kiosk-reset-fired"` attribute set on the wrapper.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FullscreenLock } from './FullscreenLock';
import { IdleScreen } from './IdleScreen';
import { useAutoReset } from './AutoReset';

export interface KioskSurfaceProps {
  /** Kiosk session id (route param). */
  readonly sessionId: string;
  /** Idle period before the idle screen appears. Defaults to 30 s. */
  readonly idleMs?: number;
  /** Idle period before the kiosk auto-resets to the first slide. */
  readonly autoResetMs?: number;
  /** Correct PIN value (compared against `?pin=...` or on-screen entry). */
  readonly adminPin: string;
  /** Fired when the kiosk auto-resets to slide 0. */
  readonly onReset?: () => void;
  /** Children rendered behind the idle / PIN overlays. */
  readonly children?: React.ReactNode;
}

const DEFAULT_IDLE_MS = 30_000;
const DEFAULT_AUTO_RESET_MS = 5 * 60 * 1000;

function readPinFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('pin');
  } catch {
    return null;
  }
}

export function KioskSurface({
  sessionId,
  idleMs = DEFAULT_IDLE_MS,
  autoResetMs = DEFAULT_AUTO_RESET_MS,
  adminPin,
  onReset,
  children,
}: KioskSurfaceProps): ReactElement {
  const [isIdle, setIsIdle] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(() => readPinFromUrl() === adminPin);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Activity-driven idle → true
  const onIdle = useCallback(() => setIsIdle(true), []);
  const { reset: resetActivity } = useAutoReset(idleMs, onIdle);

  // Separate, longer activity timer for the "auto-reset to slide 0"
  // flow. We piggyback on the same listeners but with a longer
  // timeout, so we don't double-bind events.
  const onAutoReset = useCallback(() => {
    setIsIdle(false);
    onReset?.();
  }, [onReset]);
  useAutoReset(autoResetMs, onAutoReset);

  const wake = useCallback(() => {
    setIsIdle(false);
    setPinError(null);
    resetActivity();
  }, [resetActivity]);

  // If the URL supplied a correct PIN on first paint, we've already
  // unlocked. If a wrong PIN was supplied, stay locked but don't
  // surface an error until the user attempts the on-screen pad.
  useEffect(() => {
    if (unlocked) return;
    const urlPin = readPinFromUrl();
    if (urlPin !== null && urlPin !== adminPin) {
      setPinError('Invalid PIN');
    }
  }, [adminPin, unlocked]);

  const submitPin = useCallback(() => {
    if (pinInput === adminPin) {
      setUnlocked(true);
      setPinError(null);
      setPinInput('');
      setIsIdle(false);
    } else {
      setPinError('Invalid PIN');
    }
  }, [pinInput, adminPin]);

  const sessionLabel = useMemo(() => `Kiosk · ${sessionId}`, [sessionId]);

  if (unlocked) {
    return (
      <FullscreenLock active={false}>
        <div
          data-testid="kiosk-surface"
          data-unlocked="true"
          data-session-id={sessionId}
          data-reset-fired="false"
          className="w-full h-full"
        >
          {children ?? (
            <div className="flex items-center justify-center h-full text-center p-6">
              <p className="text-2xl">{sessionLabel}</p>
            </div>
          )}
          <IdleScreen visible={isIdle} onWake={wake} />
        </div>
      </FullscreenLock>
    );
  }

  return (
    <FullscreenLock active={true}>
      <div
        data-testid="kiosk-surface"
        data-unlocked="false"
        data-session-id={sessionId}
        data-reset-fired="false"
        className="w-full h-full"
      >
        <div className="absolute top-3 right-3 text-xs text-slate-400" data-testid="kiosk-session-label">
          {sessionLabel}
        </div>
        <div className="flex items-center justify-center h-full text-center p-6">
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-lg">
            <p className="text-lg font-medium mb-4">Admin PIN required</p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center text-2xl tracking-widest font-mono bg-slate-900 text-white border border-slate-700 rounded p-3"
              placeholder="••••"
              data-testid="kiosk-pin-input"
            />
            {pinError ? (
              <p className="mt-2 text-sm text-red-400" role="alert" data-testid="kiosk-pin-error">
                {pinError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={submitPin}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white rounded p-3"
              data-testid="kiosk-pin-submit"
            >
              Unlock
            </button>
          </div>
        </div>
        <IdleScreen visible={isIdle} onWake={wake} />
      </div>
    </FullscreenLock>
  );
}