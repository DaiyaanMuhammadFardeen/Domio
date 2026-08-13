'use client';

/**
 * AutoFollowPresenter — when the presenter's laptop IS the audience
 * display (single-screen mode), follow the cursor onto slides so the
 * presenter's gaze lands on the highlighted element.
 *
 * Per Wave 4 §S4.13 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * The component:
 *   1. Listens to mousemove on the slide canvas.
 *   2. Translates the cursor to a fraction of slide bounds.
 *   3. Fires `onPointerMove({ x, y })` at most every 16 ms.
 *   4. While `enabled` is true, also paints a faint spotlight ring at
 *      the cursor location so the presenter sees what the audience
 *      sees.
 *
 * In multi-monitor setups the audience display is a separate window,
 * so `enabled` should be false (the presenter isn't driving it).
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

export interface AutoFollowPointer {
  readonly x: number;
  readonly y: number;
}

export interface AutoFollowPresenterProps {
  /** Ref to the slide canvas. The pointer position is normalized to its
   * bounding rect, so the parent must hand us the right element. */
  readonly targetRef: React.RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  readonly onPointerMove?: (pointer: AutoFollowPointer) => void;
  readonly dataTestId?: string;
}

export function AutoFollowPresenter({
  targetRef,
  enabled,
  onPointerMove,
  dataTestId = 'auto-follow-presenter',
}: AutoFollowPresenterProps): ReactElement {
  const [pointer, setPointer] = useState<AutoFollowPointer | null>(null);
  const lastEmit = useRef(0);

  const handleMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      const target = targetRef.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const next = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
      setPointer(next);
      const now = performance.now();
      if (now - lastEmit.current >= 16) {
        lastEmit.current = now;
        onPointerMove?.(next);
      }
    },
    [enabled, targetRef, onPointerMove],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [enabled, handleMove]);

  if (!enabled || !pointer) {
    return <div data-testid={dataTestId} data-enabled={enabled} hidden />;
  }

  return (
    <div
      data-testid={dataTestId}
      data-enabled={enabled}
      data-x={pointer.x.toFixed(3)}
      data-y={pointer.y.toFixed(3)}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 900,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `calc(${pointer.x * 100}% - 64px)`,
          top: `calc(${pointer.y * 100}% - 64px)`,
          width: 128,
          height: 128,
          borderRadius: '50%',
          background: 'var(--spotlight, transparent)',
          background: 'radial-gradient(circle, var(--surface-raised) 0%, transparent 70%)',
          opacity: 0.35,
        }}
      />
    </div>
  );
}
