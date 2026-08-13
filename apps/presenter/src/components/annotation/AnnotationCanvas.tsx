'use client';

/**
 * AnnotationCanvas — overlay HTML canvas over the slide viewport.
 *
 * Reads `AnnotationLayerDto[]` and renders all five ink types:
 *   - pen / highlighter → strokes
 *   - spotlight → circle/rect overlay
 *   - zoom → magnified region
 *   - blur → gaussian-style rect (we approximate with translucent fill)
 *
 * Emits `onStrokeComplete` after a stroke is finished (pointerup), so the
 * parent can persist via the AnnotationClient. Strokes use normalized
 * 0..1 coords so they replay identically across viewport sizes.
 *
 * The canvas is `pointer-events: auto` when the toolbar has pen selected,
 * `pointer-events: none` otherwise — so it doesn't block slider/click
 * controls on the slide.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  AnnotationKind,
  AnnotationLayerRecord as AnnotationLayerDto,
  BlurGeometry,
  PenGeometry,
  Point,
  SpotlightGeometry,
  ZoomGeometry,
} from '@domio/annotation-engine';

export interface AnnotationCanvasHandle {
  /** Clear local in-progress stroke (used by parent when switching slides). */
  clear: () => void;
  /** Force redraw (used when layers prop changes externally). */
  redraw: () => void;
}

export interface AnnotationCanvasProps {
  /** Layer DTOs from the AnnotationClient.list() result. */
  layers: AnnotationLayerDto[];
  /** Current slide id — used to attribute new strokes. */
  slideId: string;
  /** Active tool; only `pen` and `highlighter` allow drawing. */
  tool: AnnotationKind | null;
  /** Stroke color (hex). */
  color?: string;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** When true, the canvas captures pointer events. */
  enabled?: boolean;
  /** Emitted when a stroke completes (pointerup with non-empty stroke). */
  onStrokeComplete?: (geometry: PenGeometry) => void;
  className?: string;
  style?: CSSProperties;
}

interface InProgressStroke {
  points: Point[];
  startedAt: number;
}

const DEFAULT_COLOR = '#f85149';
const DEFAULT_WIDTH = 4;

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas(
    { layers, slideId, tool, color, strokeWidth, enabled, onStrokeComplete, className, style },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const inProgressRef = useRef<InProgressStroke | null>(null);

    // ---------------------------------------------------------------------------
    // Drawing helpers
    // ---------------------------------------------------------------------------

    const drawLayer = useCallback(
      (ctx: CanvasRenderingContext2D, layer: AnnotationLayerDto, w: number, h: number) => {
        const strokeColor = layer.color ?? DEFAULT_COLOR;
        const width = layer.stroke_width ?? DEFAULT_WIDTH;
        switch (layer.kind) {
          case 'pen':
            drawPen(ctx, layer.geometry as PenGeometry, w, h, strokeColor, width, false);
            break;
          case 'highlighter':
            drawPen(ctx, layer.geometry as PenGeometry, w, h, strokeColor, width * 4, true);
            break;
          case 'spotlight':
            drawSpotlight(ctx, layer.geometry as SpotlightGeometry, w, h);
            break;
          case 'zoom':
            drawZoom(ctx, layer.geometry as ZoomGeometry, w, h);
            break;
          case 'blur':
            drawBlur(ctx, layer.geometry as BlurGeometry, w, h, width);
            break;
        }
      },
      [],
    );

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const layer of layers) {
        if (layer.slide_id !== slideId) continue;
        drawLayer(ctx, layer, w, h);
      }
      // In-progress stroke on top.
      if (inProgressRef.current) {
        const ip = inProgressRef.current;
        drawPen(
          ctx,
          { strokes: [ip.points] },
          w,
          h,
          color ?? DEFAULT_COLOR,
          strokeWidth ?? DEFAULT_WIDTH,
          false,
        );
      }
    }, [layers, slideId, drawLayer, color, strokeWidth]);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          inProgressRef.current = null;
          redraw();
        },
        redraw,
      }),
      [redraw],
    );

    // Resize canvas to match its CSS size on every frame.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [redraw]);

    useEffect(() => {
      redraw();
    }, [redraw]);

    // ---------------------------------------------------------------------------
    // Pointer handling
    // ---------------------------------------------------------------------------

    const drawable = enabled && (tool === 'pen' || tool === 'highlighter');

    const onPointerDown = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawable) return;
        e.preventDefault();
        (e.target as Element).setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        inProgressRef.current = {
          points: [
            {
              x: (e.clientX - rect.left) / rect.width,
              y: (e.clientY - rect.top) / rect.height,
              pressure: e.pressure || 0.5,
              t: 0,
            },
          ],
          startedAt: performance.now(),
        };
      },
      [drawable],
    );

    const onPointerMove = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawable || !inProgressRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ip = inProgressRef.current;
        const last = ip.points[ip.points.length - 1];
        const t = performance.now() - ip.startedAt;
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        if (last && last.x === x && last.y === y) return;
        ip.points.push({ x, y, pressure: e.pressure || 0.5, t });
        redraw();
      },
      [drawable, redraw],
    );

    const onPointerUp = useCallback(
      (e: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawable || !inProgressRef.current) return;
        (e.target as Element).releasePointerCapture(e.pointerId);
        const ip = inProgressRef.current;
        inProgressRef.current = null;
        if (ip.points.length >= 2) {
          onStrokeComplete?.({ strokes: [ip.points] });
        }
        redraw();
      },
      [drawable, onStrokeComplete, redraw],
    );

    return (
      <canvas
        ref={canvasRef}
        data-testid="annotation-canvas"
        data-slide-id={slideId}
        className={className ?? 'annotation-canvas'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: drawable ? 'auto' : 'none',
          touchAction: 'none',
          ...style,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    );
  },
);

// ---------------------------------------------------------------------------
// Pure drawing helpers — also exported for tests
// ---------------------------------------------------------------------------

export function drawPen(
  ctx: CanvasRenderingContext2D,
  geom: PenGeometry,
  w: number,
  h: number,
  color: string,
  width: number,
  isHighlighter: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = isHighlighter ? 0.35 : 1.0;
  for (const stroke of geom.strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    const first = stroke[0];
    if (!first) continue;
    ctx.moveTo(first.x * w, first.y * h);
    for (let i = 1; i < stroke.length; i++) {
      const p = stroke[i];
      if (!p) continue;
      ctx.lineTo(p.x * w, p.y * h);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  geom: SpotlightGeometry,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 230, 0, 0.25)';
  ctx.strokeStyle = 'rgba(255, 230, 0, 0.9)';
  ctx.lineWidth = 2;
  if (geom.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(geom.x * w, geom.y * h, geom.radius * Math.min(w, h), 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  } else {
    const size = geom.radius * Math.min(w, h);
    ctx.fillRect(geom.x * w - size / 2, geom.y * h - size / 2, size, size);
    ctx.strokeRect(geom.x * w - size / 2, geom.y * h - size / 2, size, size);
  }
  ctx.restore();
}

export function drawZoom(
  ctx: CanvasRenderingContext2D,
  geom: ZoomGeometry,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(88, 166, 255, 0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(geom.x * w, geom.y * h, geom.radius * Math.min(w, h), 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawBlur(
  ctx: CanvasRenderingContext2D,
  geom: BlurGeometry,
  w: number,
  h: number,
  strokeWidth: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(248, 81, 73, 0.18)';
  ctx.strokeStyle = 'rgba(248, 81, 73, 0.5)';
  ctx.lineWidth = strokeWidth;
  ctx.fillRect(geom.x * w, geom.y * h, geom.width * w, geom.height * h);
  ctx.strokeRect(geom.x * w, geom.y * h, geom.width * w, geom.height * h);
  ctx.restore();
}
