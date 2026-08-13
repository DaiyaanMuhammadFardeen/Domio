'use client';

/**
 * GazeHighlight — soft circular spotlight that follows the presenter's
 * gaze on their own view.
 *
 * Per Wave 4 §S4.6 (initial scaffold) and Wave 11 §S11.3
 * (gaze-guided highlighting) of docs/frontend-roadmap.
 *
 * Opt-in: gaze tracking is OFF by default. The presenter must
 * acknowledge the privacy notice and complete the 9-point calibration
 * before the spotlight follows their gaze. Disabling tears down the
 * WebGazer.js tracker + camera stream.
 *
 * Drift protection: when the presenter's gaze leaves the slide area
 * (looks at chat, looks away) the highlight clamps to the slide edge
 * instead of sliding off-screen — prevents the "wandering dot" failure
 * mode called out in the acceptance criteria.
 *
 * WebGazer.js is loaded lazily via the optional `window.webgazer`
 * global. The component falls back to the cursor position when no gaze
 * model is available so it stays useful in dev / test environments.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { getGazeCalibration, recordGazeEvent, saveGazeCalibration } from '../../lib/gaze-service';

import { GazePrivacyNotice } from './GazePrivacyNotice';
import { GazeCalibration } from './GazeCalibration';

export interface GazeHighlightProps {
  /** Master switch. Defaults to off — the presenter must opt in. */
  readonly enabled: boolean;
  readonly slideWidth: number;
  readonly slideHeight: number;
  readonly dataTestId?: string;
  readonly labels?: Partial<{
    heading: string;
    description: string;
    enable: string;
    disable: string;
  }>;
}

interface ClampedPoint {
  readonly x: number;
  readonly y: number;
  readonly clamped: boolean;
}

interface WebGazerLike {
  setGazeListener(listener: (data: { x: number; y: number }) => void): void;
  begin(): Promise<void> | void;
  end(): Promise<void> | void;
  clearGazeListener(): void;
}

interface GazeSample {
  x: number;
  y: number;
}

const DEFAULT_LABELS: Required<NonNullable<GazeHighlightProps['labels']>> = {
  heading: 'Gaze-guided highlighting',
  description: 'Your audience sees a spotlight that follows where you look.',
  enable: 'Enable gaze tracking',
  disable: 'Disable gaze tracking',
};

function clampPoint(nx: number, ny: number, slideW: number, slideH: number): ClampedPoint {
  const px = Math.max(0, Math.min(slideW, nx * slideW));
  const py = Math.max(0, Math.min(slideH, ny * slideH));
  return {
    x: px / slideW,
    y: py / slideH,
    clamped: px / slideW !== nx || py / slideH !== ny,
  };
}

function getFallbackPointer(): GazeSample {
  if (typeof window === 'undefined') return { x: 0.5, y: 0.5 };
  const cached = (window as unknown as { __lastPointer?: GazeSample }).__lastPointer;
  return cached ?? { x: 0.5, y: 0.5 };
}

/**
 * Look up the optional WebGazer global exposed by a host page that
 * dynamically loaded the library. Returns null when the library is not
 * available so the caller can fall back to pointer-based gaze.
 */
async function tryLoadWebGazer(): Promise<WebGazerLike | null> {
  if (typeof window === 'undefined') return null;
  const cached = (window as unknown as { webgazer?: WebGazerLike }).webgazer;
  return cached ?? null;
}

export function GazeHighlight({
  enabled,
  slideWidth,
  slideHeight,
  dataTestId = 'gaze-highlight',
  labels,
}: GazeHighlightProps): ReactElement {
  const t = useMemo(() => ({ ...DEFAULT_LABELS, ...(labels ?? {}) }), [labels]);
  const [point, setPoint] = useState<ClampedPoint | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<
    ReadonlyArray<{ x: number; y: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);
  const gazeRef = useRef<WebGazerLike | null>(null);

  // Reset when the master switch turns off.
  useEffect(() => {
    if (!enabled) {
      setOptedIn(false);
      setCalibrated(false);
      setPrivacyOpen(false);
      setCalibrating(false);
      setCalibrationPoints([]);
      setActive(false);
      setPoint(null);
    }
  }, [enabled]);

  // Try to load any persisted calibration on first enable.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const cal = await getGazeCalibration();
        if (cancelled) return;
        if (cal && cal.points.length >= 9) {
          setCalibrationPoints(cal.points);
          setCalibrated(true);
        }
      } catch {
        /* ignore — calibrate fresh */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const beginGazeLoop = useCallback(
    (source: () => GazeSample) => {
      let running = true;
      const loop = (): void => {
        if (!running) return;
        const next = source();
        const timestamp = Date.now();
        const clamped = clampPoint(next.x, next.y, slideWidth, slideHeight);
        setPoint(clamped);
        // Fire-and-forget — the recorder is best-effort.
        void recordGazeEvent({
          x: clamped.x,
          y: clamped.y,
          confidence: 0.7,
          timestamp_ms: timestamp,
        });
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        running = false;
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    },
    [slideWidth, slideHeight],
  );

  // Start the tracker once we've calibrated (or already have points).
  useEffect(() => {
    if (!enabled || !optedIn || !calibrated) {
      setPoint(null);
      return;
    }
    setError(null);
    let cancelLoop: (() => void) | null = null;
    let activeFlag = true;

    (async () => {
      const tracker = await tryLoadWebGazer();
      if (!activeFlag) return;
      if (tracker) {
        gazeRef.current = tracker;
        try {
          await tracker.begin();
          tracker.setGazeListener((data: GazeSample) => {
            const clamped = clampPoint(data.x, data.y, slideWidth, slideHeight);
            setPoint(clamped);
            void recordGazeEvent({
              x: clamped.x,
              y: clamped.y,
              confidence: 0.9,
              timestamp_ms: Date.now(),
            });
          });
          setActive(true);
          return;
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Gaze tracker unavailable');
          setActive(false);
        }
      }
      // Fallback: pointer-position based pseudo-gaze.
      cancelLoop = beginGazeLoop(getFallbackPointer);
      setActive(true);
    })();

    return () => {
      activeFlag = false;
      if (cancelLoop) cancelLoop();
      if (gazeRef.current) {
        try {
          gazeRef.current.clearGazeListener();
          void gazeRef.current.end();
        } catch {
          /* ignore */
        }
        gazeRef.current = null;
      }
      setActive(false);
    };
  }, [enabled, optedIn, calibrated, slideWidth, slideHeight, beginGazeLoop]);

  const handleEnableClick = useCallback(() => {
    if (!enabled) return;
    setPrivacyOpen(true);
  }, [enabled]);

  const handlePrivacyConfirm = useCallback(() => {
    setPrivacyOpen(false);
    setOptedIn(true);
    if (calibrationPoints.length >= 9) {
      setCalibrated(true);
    } else {
      setCalibrating(true);
    }
  }, [calibrationPoints.length]);

  const handlePrivacyCancel = useCallback(() => {
    setPrivacyOpen(false);
  }, []);

  const handleCalibrationComplete = useCallback(
    async (points: ReadonlyArray<{ x: number; y: number }>) => {
      setCalibrationPoints(points);
      setCalibrating(false);
      try {
        await saveGazeCalibration(points);
      } catch {
        /* persistence failure is non-fatal */
      }
      setCalibrated(true);
    },
    [],
  );

  const handleCalibrationCancel = useCallback(() => {
    setCalibrating(false);
    setOptedIn(false);
  }, []);

  const handleDisable = useCallback(() => {
    setOptedIn(false);
    setCalibrated(false);
    setActive(false);
    setPoint(null);
  }, []);

  // ---- Render -----------------------------------------------------------

  const showControlPanel = enabled && !privacyOpen && !calibrating;

  return (
    <>
      {showControlPanel && (
        <div
          data-testid={`${dataTestId}-panel`}
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            padding: 12,
            borderRadius: 10,
            background: 'var(--surface-raised)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            color: 'var(--text-primary)',
            maxWidth: 280,
            zIndex: 1000,
            fontFamily: 'inherit',
          }}
        >
          <h3
            data-testid={`${dataTestId}-heading`}
            style={{ margin: 0, fontSize: 14, fontWeight: 600 }}
          >
            {t.heading}
          </h3>
          <p
            data-testid={`${dataTestId}-description`}
            style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4, opacity: 0.85 }}
          >
            {t.description}
          </p>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            {!optedIn && (
              <button
                type="button"
                data-testid={`${dataTestId}-enable`}
                onClick={handleEnableClick}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t.enable}
              </button>
            )}
            {optedIn && (
              <button
                type="button"
                data-testid={`${dataTestId}-disable`}
                onClick={handleDisable}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--danger)',
                  background: 'transparent',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t.disable}
              </button>
            )}
            <span
              data-testid={`${dataTestId}-state`}
              data-active={active ? 'true' : 'false'}
              data-calibrated={calibrated ? 'true' : 'false'}
              style={{
                alignSelf: 'center',
                fontSize: 11,
                opacity: 0.7,
              }}
            >
              {active ? 'live' : calibrated ? 'ready' : 'idle'}
            </span>
          </div>
          {error && (
            <p
              role="alert"
              data-testid={`${dataTestId}-error`}
              style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)' }}
            >
              {error}
            </p>
          )}
        </div>
      )}

      {privacyOpen && (
        <GazePrivacyNotice
          onConfirm={handlePrivacyConfirm}
          onCancel={handlePrivacyCancel}
          dataTestId={`${dataTestId}-privacy`}
        />
      )}

      {calibrating && (
        <GazeCalibration
          onComplete={handleCalibrationComplete}
          onCancel={handleCalibrationCancel}
          dataTestId={`${dataTestId}-calibration`}
        />
      )}

      {enabled && optedIn && calibrated && point && (
        <div
          data-testid={dataTestId}
          data-clamped={point.clamped}
          aria-hidden
          style={{
            position: 'absolute',
            left: `calc(${point.x * 100}% - 90px)`,
            top: `calc(${point.y * 100}% - 90px)`,
            width: 180,
            height: 180,
            borderRadius: '50%',
            // Falloff: opacity 0 at edge, 0.6 at center.
            background:
              'radial-gradient(circle, rgba(255,230,0,0.6) 0%, rgba(255,230,0,0.25) 45%, rgba(255,230,0,0) 100%)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            transition: 'left 80ms linear, top 80ms linear',
            zIndex: 50,
          }}
        />
      )}
    </>
  );
}
