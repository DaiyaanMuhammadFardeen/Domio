'use client';

/**
 * EasingBezierEditor — visual cubic-bezier editor.
 *
 * Wave 2 §S2.11 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * The editor lets the designer drag the two control points of a
 * cubic-bezier(x1, y1, x2, y2) easing curve. The preview area shows
 * a curve plot with a sweeping dot that plays the eased progress.
 *
 * The component is purely visual; it emits the parsed 4-tuple to a
 * parent callback. The parent is responsible for serialising the
 * value into a CSS `cubic-bezier(...)` string and committing it to
 * the timeline keyframe.
 *
 * Coordinate system:
 *   - The preview canvas is square (default 200×200) so the cubic
 *     literature's unit square maps 1:1.
 *   - Control points are constrained to x ∈ [0, 1] (time progress is
 *     monotone); y can be any value in [-1, 2] (overshoot is useful
 *     for spring + bounce easing).
 *   - The two anchors (0,0) and (1,1) are not draggable.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement, PointerEvent as ReactPointerEvent } from 'react';

export interface EasingBezierEditorProps {
  /** Current cubic-bezier control points. */
  value: [number, number, number, number];
  /** Fires whenever the designer releases a drag. */
  onChange: (next: [number, number, number, number]) => void;
  /** Fires on every drag tick (for callers that want a live preview). */
  onLiveChange?: ((next: [number, number, number, number]) => void) | undefined;
  /** Size of the square preview in pixels. */
  size?: number | undefined;
  /** Optional id for testing. */
  id?: string | undefined;
  /** Whether the editor is read-only. */
  readOnly?: boolean | undefined;
}

const SVG_PAD = 8;
const Y_MIN = -1;
const Y_MAX = 2;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function eventToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  fallbackSize = 200,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const width = rect.width || svg.clientWidth || fallbackSize;
  const height = rect.height || svg.clientHeight || fallbackSize;
  const x = (clientX - rect.left) / width;
  const y = (clientY - rect.top) / height;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

/**
 * Convert the SVG-y space (0 top -> 1 bottom) into the cubic-bezier-y
 * space (0 = progress start, 1 = progress end).
 */
function svgYToBezierY(svgY: number): number {
  return clamp(Y_MAX - svgY * (Y_MAX - Y_MIN), Y_MIN, Y_MAX);
}

export function EasingBezierEditor(props: EasingBezierEditorProps): ReactElement {
  const size = props.size ?? 200;
  const [p1y, p2y] = [props.value[1], props.value[3]];
  const [p1x, p2x] = [props.value[0], props.value[2]];
  const [dragIdx, setDragIdx] = useState<-1 | 0 | 1>(-1);
  // Ref-based mirror of dragIdx so the pointer-move handler always sees
  // the latest value (React state updates are async).
  const dragIdxRef = useRef<-1 | 0 | 1>(-1);
  const [liveValue, setLiveValue] = useState<[number, number, number, number] | null>(null);
  // A ref-based mirror of `liveValue` so the pointer-up handler always
  // sees the most recent drag value (React state updates are async and
  // the closure captured at render time can lag behind).
  const liveValueRef = useRef<[number, number, number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const current = liveValue ?? props.value;

  const handlePointerDown = useCallback(
    (idx: 0 | 1) => (e: ReactPointerEvent<SVGCircleElement>) => {
      if (props.readOnly) return;
      e.preventDefault();
      const target = e.target as Element & { setPointerCapture?: (id: number) => void };
      try {
        target.setPointerCapture?.(e.pointerId);
      } catch {
        // jsdom + non-browser environments may not implement setPointerCapture.
      }
      dragIdxRef.current = idx;
      setDragIdx(idx);
    },
    [props.readOnly],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragIdxRef.current === -1 || props.readOnly) return;
      const svg = svgRef.current;
      if (!svg) return;
      const { x: svgX, y: svgY } = eventToSvg(svg, e.clientX, e.clientY);
      const newX = svgX;
      const newY = svgYToBezierY(svgY);
      const next: [number, number, number, number] =
        dragIdxRef.current === 0
          ? [newX, newY, current[2], current[3]]
          : [current[0], current[1], newX, newY];
      liveValueRef.current = next;
      setLiveValue(next);
      props.onLiveChange?.(next);
    },
    [current, props],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragIdxRef.current === -1) return;
      const live = liveValueRef.current;
      dragIdxRef.current = -1;
      setDragIdx(-1);
      setLiveValue(null);
      liveValueRef.current = null;
      if (live) props.onChange(live);
      try {
        const el = e.target as Element & { releasePointerCapture?: (id: number) => void };
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        // No-op: pointer capture may have already been released.
      }
    },
    [props],
  );

  // Curve path (segmented polyline for the preview).
  const curvePath = useMemo(() => {
    const steps = 40;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = 3 * u * u * t * current[0] + 3 * u * t * t * current[2] + t * t * t;
      const y = 3 * u * u * t * current[1] + 3 * u * t * t * current[3] + t * t * t;
      pts.push(`${(x * size).toFixed(2)},${((1 - y) * size).toFixed(2)}`);
    }
    return (
      `M ${pts[0]} ` +
      pts
        .slice(1)
        .map((p) => `L ${p}`)
        .join(' ')
    );
  }, [current, size]);

  const toSvgX = (bx: number) => bx * size;
  const toSvgY = (by: number) => (1 - by) * size;

  return (
    <div
      className="easing-bezier-editor"
      data-testid={props.id ?? 'easing-bezier-editor'}
      data-readonly={props.readOnly ? 'true' : 'false'}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none', cursor: dragIdx === -1 ? 'default' : 'grabbing' }}
      >
        {/* Background grid */}
        <rect
          x={SVG_PAD}
          y={SVG_PAD}
          width={size - SVG_PAD * 2}
          height={size - SVG_PAD * 2}
          fill="var(--bg-secondary, #1a1a1a)"
          stroke="var(--border, #333)"
        />
        {/* Reference diagonal */}
        <line
          x1={SVG_PAD}
          y1={size - SVG_PAD}
          x2={size - SVG_PAD}
          y2={SVG_PAD}
          stroke="var(--muted, #666)"
          strokeDasharray="3,3"
          strokeWidth={0.5}
        />
        {/* Time + progress axis labels */}
        <text x={4} y={size - 4} fontSize={9} fill="var(--muted, #888)">
          0
        </text>
        <text x={size - 8} y={12} fontSize={9} fill="var(--muted, #888)">
          1
        </text>

        {/* Bezier handle lines */}
        <line
          x1={0}
          y1={size}
          x2={toSvgX(p1x)}
          y2={toSvgY(p1y)}
          stroke="var(--accent, #58a6ff)"
          strokeOpacity={0.4}
          strokeWidth={1}
          strokeDasharray="2,2"
        />
        <line
          x1={size}
          y1={0}
          x2={toSvgX(p2x)}
          y2={toSvgY(p2y)}
          stroke="var(--accent, #58a6ff)"
          strokeOpacity={0.4}
          strokeWidth={1}
          strokeDasharray="2,2"
        />

        {/* Curve */}
        <path d={curvePath} fill="none" stroke="var(--accent, #58a6ff)" strokeWidth={2} />

        {/* Anchor points (fixed) */}
        <circle
          cx={0}
          cy={size}
          r={3}
          fill="var(--muted, #888)"
          data-testid="easing-bezier-anchor-0"
        />
        <circle
          cx={size}
          cy={0}
          r={3}
          fill="var(--muted, #888)"
          data-testid="easing-bezier-anchor-1"
        />

        {/* Control points (draggable) */}
        <circle
          cx={toSvgX(p1x)}
          cy={toSvgY(p1y)}
          r={6}
          fill="var(--accent, #58a6ff)"
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: props.readOnly ? 'default' : 'grab' }}
          onPointerDown={handlePointerDown(0)}
          data-testid="easing-bezier-handle-0"
        />
        <circle
          cx={toSvgX(p2x)}
          cy={toSvgY(p2y)}
          r={6}
          fill="var(--accent, #58a6ff)"
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: props.readOnly ? 'default' : 'grab' }}
          onPointerDown={handlePointerDown(1)}
          data-testid="easing-bezier-handle-1"
        />
      </svg>

      <div className="easing-bezier-editor__readout" data-testid="easing-bezier-readout">
        <span>
          cubic-bezier({formatNum(current[0])}, {formatNum(current[1])}, {formatNum(current[2])},{' '}
          {formatNum(current[3])})
        </span>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isNaN(n)) return '0';
  return Math.abs(n) < 1e-4 ? '0' : n.toFixed(3).replace(/\.?0+$/, '');
}

/** Parse a cubic-bezier control point tuple from a string. */
export function parseBezierTuple(value: string): [number, number, number, number] | null {
  const match =
    /^cubic-bezier\(\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*\)$/.exec(
      value,
    );
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

/** Serialise a 4-tuple back into a CSS `cubic-bezier(...)` string. */
export function formatBezierTuple(value: [number, number, number, number]): string {
  return `cubic-bezier(${formatNum(value[0])}, ${formatNum(value[1])}, ${formatNum(value[2])}, ${formatNum(value[3])})`;
}

/**
 * Default control points for the named CSS easing presets, so the
 * editor can switch between preset + custom without losing data.
 */
export const EASING_BEZIER_PRESETS: ReadonlyArray<{
  name: string;
  value: [number, number, number, number];
}> = [
  { name: 'linear', value: [0, 0, 1, 1] },
  { name: 'ease-in', value: [0.42, 0, 1, 1] },
  { name: 'ease-out', value: [0, 0, 0.58, 1] },
  { name: 'ease-in-out', value: [0.42, 0, 0.58, 1] },
  { name: 'ease-in-quad', value: [0.55, 0.085, 0.68, 0.53] },
  { name: 'ease-out-quad', value: [0.25, 0.46, 0.45, 0.94] },
  { name: 'ease-in-out-quad', value: [0.455, 0.03, 0.515, 0.955] },
];
