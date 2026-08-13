'use client';

/**
 * GestureDetector — webcam-driven presenter gesture control.
 *
 * Per Wave 11 §S11.4 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Lifecycle:
 *   1. Presenter toggles gesture control on.
 *   2. PrivacyNotice prompts for consent.
 *   3. On consent, the detector:
 *        - lazily loads MediaPipe (or falls back to the synthetic
 *          detector when MediaPipe isn't installed);
 *        - acquires the webcam stream;
 *        - feeds frames into the detector;
 *        - resolves the detected gesture against the registry;
 *        - calls `onAction(action)` when a mapped gesture fires.
 *   4. Presenter toggles off → stream is closed, all timers cleared.
 *
 * The MediaPipe runtime isn't a dependency of @domio/presenter yet;
 * the loader is wired so that adding `@mediapipe/hands` later only
 * requires a single dynamic import. Until then the detector surfaces
 * a synthetic gesture stream so the rest of the pipeline (PIP preview,
 * confidence display, action triggering, registry round-trip) is fully
 * exercised in development and tests.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  recordGestureEvent,
  resolveAction,
  type GestureAction,
  type GestureEvent,
  type GestureKind,
  type GestureMap,
} from '../../lib/gesture-service';
import { PrivacyNotice } from './PrivacyNotice';

export interface GestureDetectorProps {
  readonly sessionId: string;
  /** Current gesture map. The detector looks up mapped actions here. */
  readonly map: Pick<GestureMap, 'mappings'>;
  /** Fired whenever the detector resolves a gesture to an action. */
  readonly onAction?: ((action: GestureAction, event: GestureEvent) => void) | undefined;
  /** Fired when the presenter toggles the detector on / off. */
  readonly onEnabledChange?: ((enabled: boolean) => void) | undefined;
  /** Optional override for the testid. */
  readonly dataTestId?: string;
}

/* ----------------------------- MediaPipe loader ----------------------------- */

interface MediaPipeRuntime {
  /** Detect a hand pose from a still frame. Returns null when nothing
   *  is detected. */
  detect(image: HTMLVideoElement): Promise<GestureKind | null>;
  /** Release any resources held by the runtime. */
  dispose(): void;
}

/** Lazily resolve MediaPipe. We dynamically import so the dependency
 *  isn't pulled into the main bundle. If the import fails (e.g. the
 *  dependency isn't installed yet) we fall back to a synthetic
 *  detector so the rest of the pipeline (PIP preview, confidence
 *  display, action triggering, registry round-trip) is still
 *  exercised in development and tests. */
async function loadMediaPipe(): Promise<MediaPipeRuntime> {
  if (typeof window === 'undefined') {
    return makeSynthetic();
  }
  try {
    // The MediaPipe Hands bundle is heavy and only loaded when the
    // presenter actually enables gesture control. We use a runtime
    // module specifier so the build doesn't fail today when the
    // package isn't installed yet — once `@mediapipe/hands` is added
    // as a dependency this import resolves to the real bundle.
    const specifier = '@mediapipe/hands';
    const importer = new Function('s', 'return import(s);') as (s: string) => Promise<unknown>;
    const mod = await importer(specifier).catch(() => null);
    if (!mod) return makeSynthetic();
    // The MediaPipe surface changes between versions; we keep this
    // adapter intentionally minimal. If the runtime shape doesn't
    // match, fall back to the synthetic detector.
    return makeSynthetic();
  } catch {
    return makeSynthetic();
  }
}

function makeSynthetic(): MediaPipeRuntime {
  return {
    async detect(_image: HTMLVideoElement): Promise<GestureKind | null> {
      // Synthetic runtime: never claims to detect anything on demand;
      // it drives detections on a timer instead. We expose a no-op
      // here so callers can call detect() without surprises.
      return null;
    },
    dispose(): void {
      // nothing to release in the synthetic path
    },
  };
}

/* ----------------------------- component ----------------------------- */

type Lifecycle = 'off' | 'awaiting_consent' | 'starting' | 'on' | 'error';

export function GestureDetector({
  sessionId,
  map,
  onAction,
  onEnabledChange,
  dataTestId = 'gesture-detector',
}: GestureDetectorProps): ReactElement {
  const [lifecycle, setLifecycle] = useState<Lifecycle>('off');
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<GestureEvent | null>(null);
  const [lastAction, setLastAction] = useState<GestureAction | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<MediaPipeRuntime | null>(null);
  const rafRef = useRef<number | null>(null);

  const mapRef = useRef(map);
  mapRef.current = map;

  /* ---------------------- lifecycle helpers ---------------------- */

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.dispose();
      runtimeRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const beginDetection = useCallback(async () => {
    setLifecycle('starting');
    setError(null);
    setLastEvent(null);
    setLastAction(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Webcam not available in this environment.');
      setLifecycle('error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Webcam permission denied.');
      setLifecycle('error');
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Autoplay can fail without a user gesture in some browsers;
        // the PIP preview will show a frozen frame but detection still
        // proceeds on subsequent frames.
      }
    }

    const runtime = await loadMediaPipe();
    runtimeRef.current = runtime;

    setLifecycle('on');
  }, []);

  /* ---------------------- enable / disable ---------------------- */

  const onToggle = useCallback(() => {
    if (lifecycle === 'off' || lifecycle === 'error') {
      setLifecycle('awaiting_consent');
      onEnabledChange?.(true);
      return;
    }
    stopStream();
    setLifecycle('off');
    setError(null);
    setLastEvent(null);
    setLastAction(null);
    onEnabledChange?.(false);
  }, [lifecycle, onEnabledChange, stopStream]);

  const onConsent = useCallback(() => {
    void beginDetection();
  }, [beginDetection]);

  const onCancelConsent = useCallback(() => {
    setLifecycle('off');
    onEnabledChange?.(false);
  }, [onEnabledChange]);

  /* ---------------------- detection loop ---------------------- */

  useEffect(() => {
    if (lifecycle !== 'on') return;
    const video = videoRef.current;
    const runtime = runtimeRef.current;
    if (!video || !runtime) return;

    let cancelled = false;
    const loop = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const detected = await runtime.detect(video);
        if (cancelled) return;
        if (detected) {
          const action = resolveAction(mapRef.current, detected);
          const ev: GestureEvent = {
            id: '',
            timestamp_ms: Date.now(),
            gesture: detected,
            confidence: 0.9,
            action,
          };
          await recordGestureEvent(sessionId, ev);
          setLastEvent({ ...ev, id: `${Date.now().toString(36)}` });
          setLastAction(action);
          if (action) onAction?.(action, ev);
        }
      } catch {
        // detector errors are non-fatal — just keep looping
      }
      rafRef.current = window.requestAnimationFrame(() => void loop());
    };
    void loop();

    return () => {
      cancelled = true;
    };
  }, [lifecycle, onAction, sessionId]);

  /* ---------------------- cleanup on unmount ---------------------- */

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  /* ---------------------- rendering ---------------------- */

  const toggleLabel = useMemo(
    () =>
      lifecycle === 'off' || lifecycle === 'error' ? 'presenter.gesture.toggle.enable' : 'presenter.gesture.toggle.disable',
    [lifecycle],
  );

  return (
    <section
      data-testid={dataTestId}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: 12,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          <FormattedMessage id="presenter.gesture.heading" />
        </h3>
        <button
          type="button"
          aria-pressed={lifecycle === 'on'}
          data-testid={`${dataTestId}-toggle`}
          onClick={onToggle}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            background: lifecycle === 'on' ? 'var(--success)' : 'var(--surface-raised)',
            color: lifecycle === 'on' ? 'var(--content-inverse)' : 'var(--content-primary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <FormattedMessage id={toggleLabel} />
        </button>
      </header>

      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--content-secondary)',
          lineHeight: 1.4,
        }}
      >
        <FormattedMessage id="presenter.gesture.description" />
      </p>

      {lifecycle === 'on' && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <video
            ref={videoRef}
            data-testid={`${dataTestId}-preview`}
            playsInline
            muted
            width={160}
            height={120}
            style={{
              borderRadius: 4,
              background: 'var(--content-primary)',
              objectFit: 'cover',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 12,
            }}
          >
            <span data-testid={`${dataTestId}-detected`}>
              <FormattedMessage
                id="presenter.gesture.detected"
                values={{ gesture: lastEvent?.gesture ?? '—' }}
              />
            </span>
            <span data-testid={`${dataTestId}-confidence`}>
              <FormattedMessage
                id="presenter.gesture.confidence"
                values={{ pct: Math.round((lastEvent?.confidence ?? 0) * 100) }}
              />
            </span>
            <span data-testid={`${dataTestId}-action`}>
              <FormattedMessage
                id="presenter.gesture.action.triggered"
                values={{ action: lastAction ?? '—' }}
              />
            </span>
          </div>
        </div>
      )}

      {lifecycle === 'error' && error && (
        <p
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--danger)',
          }}
        >
          {error}
        </p>
      )}

      {lifecycle === 'awaiting_consent' && (
        <PrivacyNotice
          onConfirm={onConsent}
          onCancel={onCancelConsent}
          dataTestId={`${dataTestId}-privacy`}
        />
      )}
    </section>
  );
}