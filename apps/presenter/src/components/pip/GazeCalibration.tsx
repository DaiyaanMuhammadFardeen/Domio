'use client';

/**
 * GazeCalibration — 9-point calibration flow.
 *
 * Per Wave 11 §S11.3 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Shows 9 dots in a 3×3 grid one at a time. The presenter clicks each
 * dot while looking at it; each click refines the gaze model. When the
 * 9th dot is clicked we call `onComplete(points)` with the normalized
 * (x, y) coordinates of every clicked point in order.
 *
 * The component is presentation-only — it does not load WebGazer.js.
 * The parent (GazeHighlight) is responsible for translating the click
 * samples into refined model parameters and persisting them via
 * gaze-service.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

export interface GazeCalibrationProps {
  /** Called once all 9 points have been clicked. */
  readonly onComplete: (points: ReadonlyArray<{ x: number; y: number }>) => void;
  /** Called when the user dismisses the calibration early. */
  readonly onCancel?: () => void;
  readonly dataTestId?: string;
  readonly labels?: Partial<{
    heading: string;
    instructions: string;
    complete: string;
    cancel: string;
  }>;
}

const DEFAULT_LABELS: Required<NonNullable<GazeCalibrationProps['labels']>> = {
  heading: 'Calibrate',
  instructions: 'Click each dot as it appears. Look at the dot when you click.',
  complete: 'Calibration complete',
  cancel: 'Cancel',
};

const GRID: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.9 },
];

/**
 * Normalize a click event relative to the calibration surface so the
 * returned coordinates are in the 0..1 grid used by the gaze service.
 * Falls back to the preset grid position when the surface is detached
 * or the event has no bounding box.
 */
function clickToNormalized(
  e: React.MouseEvent<HTMLDivElement>,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const target = e.currentTarget;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return fallback;
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1, nx)),
    y: Math.max(0, Math.min(1, ny)),
  };
}

export function GazeCalibration({
  onComplete,
  onCancel,
  dataTestId = 'gaze-calibration',
  labels,
}: GazeCalibrationProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [done, setDone] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);

  const finish = useCallback(
    (collected: ReadonlyArray<{ x: number; y: number }>) => {
      if (completedRef.current) return;
      completedRef.current = true;
      setDone(true);
      onComplete(collected);
    },
    [onComplete],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (done) return;
      const fallback = GRID[index] ?? { x: 0.5, y: 0.5 };
      const point = clickToNormalized(e, fallback);
      const next = [...points, point];
      setPoints(next);
      if (next.length >= GRID.length) {
        finish(next);
      } else {
        setIndex(next.length);
      }
    },
    [done, index, points, finish],
  );

  // If the calibration is unmounted before completion, call onCancel.
  useEffect(() => {
    return () => {
      if (!completedRef.current) onCancel?.();
    };
  }, [onCancel]);

  const current = GRID[index];
  const total = GRID.length;
  const progressLabel = `${Math.min(points.length + 1, total)} of ${total}`;

  return (
    <div
      ref={stageRef}
      role="region"
      aria-label={t.heading}
      data-testid={dataTestId}
      data-progress={progressLabel}
      onClick={handleClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        color: 'var(--accent-fg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        cursor: 'crosshair',
        userSelect: 'none',
      }}
    >
      <header
        style={{
          position: 'absolute',
          top: 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <h2
          data-testid={`${dataTestId}-heading`}
          style={{ margin: 0, fontSize: 20, fontWeight: 600 }}
        >
          {t.heading}
        </h2>
        <p
          data-testid={`${dataTestId}-instructions`}
          style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}
        >
          {t.instructions}
        </p>
        <p
          data-testid={`${dataTestId}-progress`}
          style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}
        >
          {progressLabel}
        </p>
      </header>

      {current && (
        <div
          data-testid={`${dataTestId}-dot`}
          data-index={index}
          data-dot-x={current.x}
          data-dot-y={current.y}
          aria-hidden
          style={{
            position: 'absolute',
            left: `calc(${current.x * 100}% - 16px)`,
            top: `calc(${current.y * 100}% - 16px)`,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, var(--gaze-dot-inner) 0%, var(--gaze-dot-outer) 70%, transparent 100%)',
            boxShadow: '0 0 24px 4px rgba(255,80,80,0.4)',
            pointerEvents: 'none',
          }}
        />
      )}

      {done && (
        <div
          data-testid={`${dataTestId}-complete`}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          {t.complete}
        </div>
      )}

      {onCancel && (
        <button
          type="button"
          data-testid={`${dataTestId}-cancel`}
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.4)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          {t.cancel}
        </button>
      )}
    </div>
  );
}
