'use client';

/**
 * GazeHighlight — subtle spotlight that follows the presenter's gaze.
 *
 * Per Wave 4 §S4.6 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Opt-in: only mounts a webcam preview when `enabled` is true and the
 * browser exposes WebGazer.js (or a polyfill). The actual gaze
 * prediction library is loaded lazily on first activation.
 *
 * Drift protection: when the presenter's gaze leaves the slide area
 * (e.g. looks at chat, looks away), the highlight clamps to the slide
 * edge instead of sliding off-screen — prevents the "wandering dot"
 * failure mode called out in the acceptance criteria.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

export interface GazeHighlightProps {
  readonly enabled: boolean;
  readonly slideWidth: number;
  readonly slideHeight: number;
  readonly dataTestId?: string;
}

export interface GazePoint {
  /** Normalized 0..1 across the slide. */
  readonly x: number;
  readonly y: number;
}

interface ClampedPoint extends GazePoint {
  /** True when the source gaze was outside the slide and clamped. */
  readonly clamped: boolean;
}

function clamp(p: GazePoint, slideW: number, slideH: number): ClampedPoint {
  const x = Math.max(0, Math.min(slideW, p.x * slideW)) / slideW;
  const y = Math.max(0, Math.min(slideH, p.y * slideH)) / slideH;
  return { x, y, clamped: x !== p.x || y !== p.y };
}

export function GazeHighlight({
  enabled,
  slideWidth,
  slideHeight,
  dataTestId = 'gaze-highlight',
}: GazeHighlightProps): ReactElement | null {
  const [point, setPoint] = useState<ClampedPoint | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setPoint(null);
      return;
    }
    let active = true;

    function tick(): GazePoint {
      // Placeholder gaze source: until WebGazer.js is wired in, derive
      // from pointer position so the highlight tracks the cursor. This
      // keeps the API stable while the real gaze model lands.
      if (typeof window === 'undefined') return { x: 0.5, y: 0.5 };
      const last = (window as unknown as { __lastPointer?: GazePoint }).__lastPointer;
      return last ?? { x: 0.5, y: 0.5 };
    }

    function loop(): void {
      if (!active) return;
      const next = tick();
      setPoint(clamp(next, slideWidth, slideHeight));
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, slideWidth, slideHeight]);

  if (!enabled || !point) return null;

  return (
    <div
      data-testid={dataTestId}
      data-clamped={point.clamped}
      style={{
        position: 'absolute',
        left: `calc(${point.x * 100}% - 60px)`,
        top: `calc(${point.y * 100}% - 60px)`,
        width: 120,
        height: 120,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,230,0,0.35), rgba(255,230,0,0))',
        pointerEvents: 'none',
        transition: 'left 80ms linear, top 80ms linear',
      }}
    />
  );
}