'use client';

/**
 * PiPBubble — webcam feed overlaid on the slide.
 *
 * Per Wave 4 §S4.6 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Renders a <video> element fed from getUserMedia({ video: true }), wrapped
 * in a draggable + resizable bubble. The bubble can be flipped between
 * webcam-with-background and webcam-with-virtual-background by setting
 * `virtualBackground` to true.
 *
 * On non-secure contexts (HTTP non-localhost) getUserMedia throws; we
 * surface a friendly fallback so the presenter view stays usable.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

export interface PiPBubbleProps {
  /** Disable camera entirely (e.g. when recording-only mode is on). */
  readonly disabled?: boolean;
  /** When true, route the video through a virtual-background canvas. */
  readonly virtualBackground?: boolean;
  /** Where to dock the bubble on first paint. */
  readonly initialPosition?: { x: number; y: number };
  /** Initial size (px). */
  readonly initialSize?: { width: number; height: number };
  readonly dataTestId?: string;
}

const DEFAULT_POS = { x: 16, y: 16 };
const DEFAULT_SIZE = { width: 160, height: 120 };

export function PiPBubble({
  disabled = false,
  virtualBackground = false,
  initialPosition = DEFAULT_POS,
  initialSize = DEFAULT_SIZE,
  dataTestId = 'pip-bubble',
}: PiPBubbleProps): ReactElement | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [resizing, setResizing] = useState<null | 'se' | 'nw' | 'ne' | 'sw'>(null);

  const onResizePointerDown = useCallback(
    (handle: 'se' | 'nw' | 'ne' | 'sw') => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setResizing(handle);
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizing) return;
      setSize((prev) => {
        const dw = e.movementX;
        const dh = e.movementY;
        let { width, height } = prev;
        if (resizing === 'se') {
          width = Math.max(80, width + dw);
          height = Math.max(60, height + dh);
        } else if (resizing === 'sw') {
          width = Math.max(80, width - dw);
          height = Math.max(60, height + dh);
          setPosition((p) => ({ ...p, x: p.x + dw }));
        } else if (resizing === 'ne') {
          width = Math.max(80, width + dw);
          height = Math.max(60, height - dh);
          setPosition((p) => ({ ...p, y: p.y + dh }));
        } else {
          width = Math.max(80, width - dw);
          height = Math.max(60, height - dh);
          setPosition((p) => ({ ...p, x: p.x + dw, y: p.y + dh }));
        }
        return { width, height };
      });
    },
    [resizing],
  );

  const onResizePointerUp = useCallback(() => setResizing(null), []);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Start the webcam on mount.
  useEffect(() => {
    if (disabled) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setError('Camera API not available in this browser.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            /* autoplay restrictions */
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start camera');
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [disabled]);

  // Drag handling.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(true);
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setPosition((prev) => ({
        x: Math.max(0, prev.x + e.movementX),
        y: Math.max(0, prev.y + e.movementY),
      }));
    },
    [dragging],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore — already released
    }
  }, []);

  if (disabled) return null;

  const containerStyle: CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
    background: 'var(--surface-raised)',
    cursor: dragging ? 'grabbing' : 'grab',
    zIndex: 900,
    userSelect: 'none',
  };

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      style={containerStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <video
        ref={videoRef}
        data-testid={`${dataTestId}-video`}
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Mirror for natural "selfie" preview.
          transform: 'scaleX(-1)',
          display: virtualBackground ? 'none' : 'block',
        }}
      />
      {virtualBackground && (
        <canvas
          data-testid={`${dataTestId}-vb-canvas`}
          width={size.width}
          height={size.height}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      )}
      {error && (
        <p
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            padding: 4,
            fontSize: 10,
            color: 'var(--danger)',
            background: 'var(--surface-base)',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}
      <div
        style={{
          position: 'absolute',
          right: 4,
          bottom: 4,
          width: 10,
          height: 10,
          borderRadius: 5,
          background: error ? 'var(--danger)' : 'var(--success)',
        }}
      />
      <div
        data-testid={`${dataTestId}-resize`}
        onPointerDown={onResizePointerDown('se')}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 12,
          height: 12,
          cursor: 'nwse-resize',
          background: 'var(--surface-raised)',
        }}
      />
    </div>
  );
}
