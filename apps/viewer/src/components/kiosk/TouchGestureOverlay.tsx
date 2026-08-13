/**
 * TouchGestureOverlay — captures tap zones + long-press for kiosk playback.
 *
 * Per Wave 11 §S11.14 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The overlay sits over the slide stage with two pointer-event
 * capture zones: the left half = previous, the right half = next. A
 * long-press (>= 600ms hold without release) toggles paused state so a
 * trade-show operator can freeze the deck while answering questions.
 *
 * On first mount the overlay shows a 3-second hint ("Tap right to
 * advance") that fades away. The hint is suppressed if the parent
 * supplies `hintShown={true}` (e.g. when the operator has already
 * dismissed it once).
 */

'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

export interface TouchGestureOverlayProps {
  readonly onNext: () => void;
  readonly onPrev: () => void;
  readonly onLongPress: () => void;
  readonly paused?: boolean;
  readonly hintLabel?: string;
  readonly hintDurationMs?: number;
  readonly longPressMs?: number;
  readonly dataTestId?: string;
}

interface ActivePress {
  pointerId: number;
  startX: number;
  startY: number;
  startMs: number;
  zone: 'left' | 'right';
  firedLongPress: boolean;
  moved: boolean;
}

const DEFAULT_LONG_PRESS_MS = 600;
const DEFAULT_HINT_MS = 3000;
const MOVE_THRESHOLD_PX = 12;

export function TouchGestureOverlay({
  onNext,
  onPrev,
  onLongPress,
  paused = false,
  hintLabel,
  hintDurationMs = DEFAULT_HINT_MS,
  longPressMs = DEFAULT_LONG_PRESS_MS,
  dataTestId = 'kiosk-touch',
}: TouchGestureOverlayProps): ReactElement {
  const [hintVisible, setHintVisible] = useState(true);
  const [pressFlash, setPressFlash] = useState<'left' | 'right' | null>(null);
  const activeRef = useRef<ActivePress | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide hint after a delay.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => setHintVisible(false), hintDurationMs);
    return () => window.clearTimeout(t);
  }, [hintDurationMs]);

  const clearLongPress = useCallback((): void => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const flash = useCallback((zone: 'left' | 'right'): void => {
    setPressFlash(zone);
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setPressFlash(null), 180);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, zone: 'left' | 'right'): void => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.currentTarget.setPointerCapture(e.pointerId);
      activeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startMs: Date.now(),
        zone,
        firedLongPress: false,
        moved: false,
      };
      clearLongPress();
      longPressTimerRef.current = setTimeout(() => {
        const a = activeRef.current;
        if (!a || a.firedLongPress || a.moved) return;
        a.firedLongPress = true;
        onLongPress();
      }, longPressMs);
    },
    [clearLongPress, longPressMs, onLongPress],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const a = activeRef.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
      a.moved = true;
      clearLongPress();
    }
  }, [clearLongPress]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      const a = activeRef.current;
      if (!a || a.pointerId !== e.pointerId) return;
      clearLongPress();
      // If the long-press already fired, suppress the tap handler.
      if (!a.firedLongPress && !a.moved) {
        flash(a.zone);
        if (a.zone === 'right') onNext();
        else onPrev();
      }
      activeRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    },
    [clearLongPress, flash, onNext, onPrev],
  );

  useEffect(
    () => () => {
      clearLongPress();
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    },
    [clearLongPress],
  );

  return (
    <div
      data-testid={dataTestId}
      data-paused={paused ? 'true' : 'false'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        zIndex: 50,
        touchAction: 'manipulation',
        userSelect: 'none',
      }}
    >
      <div
        data-testid={`${dataTestId}-zone-left`}
        onPointerDown={(e) => onPointerDown(e, 'left')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: 'none',
          background: pressFlash === 'left' ? 'rgba(56,189,248,0.12)' : 'transparent',
          transition: 'background-color 120ms ease-out',
        }}
        aria-label="Previous slide zone"
      />
      <div
        data-testid={`${dataTestId}-zone-right`}
        onPointerDown={(e) => onPointerDown(e, 'right')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          cursor: 'none',
          background: pressFlash === 'right' ? 'rgba(56,189,248,0.12)' : 'transparent',
          transition: 'background-color 120ms ease-out',
        }}
        aria-label="Next slide zone"
      />
      {hintVisible && hintLabel ? (
        <div
          data-testid={`${dataTestId}-hint`}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 80,
            transform: 'translateX(-50%)',
            padding: '8px 14px',
            background: 'rgba(0,0,0,0.65)',
            color: 'rgba(255,255,255,0.95)',
            borderRadius: 999,
            fontFamily: 'system-ui',
            fontSize: 14,
            letterSpacing: 0.2,
            pointerEvents: 'none',
            zIndex: 60,
          }}
        >
          {hintLabel}
        </div>
      ) : null}
      {paused ? (
        <div
          data-testid={`${dataTestId}-paused`}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            color: '#fff',
            fontFamily: 'system-ui',
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 70,
          }}
        >
          ❚❚ Paused
        </div>
      ) : null}
    </div>
  );
}
