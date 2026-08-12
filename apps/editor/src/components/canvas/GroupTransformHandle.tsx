/**
 * GroupTransformHandle — bounding box + resize + rotate handles for
 * a multi-selection.
 *
 * Wave 2 §S2.3. The handle is an SVG overlay that draws:
 *   • a stroked bounding box around the union AABB of every selected
 *     element,
 *   • eight square resize handles (NW / N / NE / W / E / SW / S / SE),
 *   • a single rotation handle above the box (visible when 2+
 *     elements are selected).
 *
 * The component is presentational — it does not own the resize / drag
 * state. The drag loop (which lands with the canvas-pointer rework in
 * a follow-up sub-phase) reads the handle's `onResizeStart` /
 * `onRotateStart` event hooks to dispatch a `propEditOp` while
 * dragging. Without that wiring, the box displays and pointer-events
 * are still routed back to the parent layer beneath.
 */

import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { Element } from '@domio/schema/generated/scene-graph';
import { useViewport } from '../../hooks/useViewport';

export interface GroupTransformHandleProps {
  /** Every selected element — at least one element required. */
  elements: ReadonlyArray<Element>;
  /** Slide canvas width (slide units before zoom). */
  slideWidth: number;
  /** Slide canvas height (slide units before zoom). */
  slideHeight: number;
  /**
   * Optional callback the canvas drag loop subscribes to. The
   * argument is the resize-edge that fired (`nw | n | ne | ...`).
   * The handle does not own the resize state — the parent owns it.
   */
  onResizeStart?: (edge: ResizeEdge) => void;
  /** Optional rotation handle callback. */
  onRotateStart?: () => void;
}

export type ResizeEdge =
  | 'nw'
  | 'n'
  | 'ne'
  | 'w'
  | 'e'
  | 'sw'
  | 's'
  | 'se';

const HANDLE_SIZE_SLIDE = 8;

interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

function unionAabb(elements: ReadonlyArray<Element>): Aabb | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const el of elements) {
    const t = el.transform;
    if (!t) continue;
    any = true;
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x + t.w > maxX) maxX = t.x + t.w;
    if (t.y + t.h > maxY) maxY = t.y + t.h;
  }
  if (!any) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function GroupTransformHandle(
  props: GroupTransformHandleProps,
): ReactElement | null {
  const { elements, slideWidth, slideHeight, onResizeStart, onRotateStart } = props;
  const { zoom, pan } = useViewport();

  const aabb = useMemo(() => unionAabb(elements), [elements]);
  if (!aabb) return null;

  const rotateVisible = elements.length >= 2;
  const handle = HANDLE_SIZE_SLIDE / zoom;

  // Handle positions in slide units around the bounding box.
  const handles: Array<{ edge: ResizeEdge; cx: number; cy: number; cursor: string }> = [
    { edge: 'nw', cx: aabb.x, cy: aabb.y, cursor: 'nwse-resize' },
    { edge: 'n', cx: aabb.x + aabb.w / 2, cy: aabb.y, cursor: 'ns-resize' },
    { edge: 'ne', cx: aabb.x + aabb.w, cy: aabb.y, cursor: 'nesw-resize' },
    { edge: 'w', cx: aabb.x, cy: aabb.y + aabb.h / 2, cursor: 'ew-resize' },
    { edge: 'e', cx: aabb.x + aabb.w, cy: aabb.y + aabb.h / 2, cursor: 'ew-resize' },
    { edge: 'sw', cx: aabb.x, cy: aabb.y + aabb.h, cursor: 'nesw-resize' },
    { edge: 's', cx: aabb.x + aabb.w / 2, cy: aabb.y + aabb.h, cursor: 'ns-resize' },
    { edge: 'se', cx: aabb.x + aabb.w, cy: aabb.y + aabb.h, cursor: 'nwse-resize' },
  ];

  return (
    <svg
      className="canvas-group-handle"
      style={{
        position: 'absolute',
        left: 18,
        top: 18,
        width: slideWidth * zoom,
        height: slideHeight * zoom,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 3,
      }}
      viewBox={`0 0 ${slideWidth} ${slideHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="canvas-group-handle"
    >
      <g transform={`translate(${pan.x / zoom} ${pan.y / zoom})`}>
        {/* Bounding box */}
        <rect
          x={aabb.x}
          y={aabb.y}
          width={aabb.w}
          height={aabb.h}
          fill="none"
          stroke="var(--accent-magenta)"
          strokeWidth={1 / zoom}
          strokeDasharray={`${4 / zoom} ${4 / zoom}`}
        />
        {/* Resize handles */}
        {handles.map((h) => (
          <rect
            key={h.edge}
            x={h.cx - handle / 2}
            y={h.cy - handle / 2}
            width={handle}
            height={handle}
            fill="var(--surface-base)"
            stroke="var(--accent-magenta)"
            strokeWidth={1 / zoom}
            style={{
              pointerEvents: 'auto',
              cursor: h.cursor,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onResizeStart?.(h.edge);
            }}
            data-resize-edge={h.edge}
          />
        ))}
        {/* Rotation handle */}
        {rotateVisible ? (
          <g style={{ pointerEvents: 'auto' }}>
            <line
              x1={aabb.x + aabb.w / 2}
              y1={aabb.y}
              x2={aabb.x + aabb.w / 2}
              y2={aabb.y - 20 / zoom}
              stroke="var(--accent-magenta)"
              strokeWidth={1 / zoom}
            />
            <circle
              cx={aabb.x + aabb.w / 2}
              cy={aabb.y - 20 / zoom}
              r={handle / 2}
              fill="var(--accent-magenta)"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onRotateStart?.();
              }}
              data-rotate-handle
            />
          </g>
        ) : null}
      </g>
    </svg>
  );
}

export type { Aabb as GroupTransformAabb };