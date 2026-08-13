/**
 * GridOverlay — background grid lines for the canvas.
 *
 * Wave 2 §S2.1. When `useEditorStore().showGrid` is true the
 * overlay paints an 8 px square grid in slide coordinates. The
 * pattern adapts to the viewport's zoom + pan so the lines stay
 * crisp at any zoom level.
 *
 * The overlay is rendered as an SVG with a tiled `<pattern>` so the
 * DOM stays at O(1) regardless of viewport size. A user can drag
 * the grid to a particular column to set up an `AutoLayoutSpec`'s
 * anchor; that interaction is deferred to a later sub-phase.
 */

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useViewport } from '../../hooks/useViewport';

export interface GridOverlayProps {
  /** Slide width (units before zoom). */
  slideWidth: number;
  /** Slide height (units before zoom). */
  slideHeight: number;
  /** Grid square size in slide units (default 8). */
  size?: number;
}

const ZOOM_LINE_WIDTH = 1;

export function GridOverlay(props: GridOverlayProps): ReactElement | null {
  const { slideWidth, slideHeight, size = 8 } = props;
  const showGrid = useEditorStore((s) => s.showGrid);
  const { zoom, pan } = useViewport();

  const tileId = useMemo(() => `grid-${size}-${(zoom * 1000) | 0}`, [size, zoom]);

  if (!showGrid) return null;

  return (
    <svg
      className="canvas-grid"
      style={{
        position: 'absolute',
        left: 18,
        top: 18,
        width: slideWidth * zoom,
        height: slideHeight * zoom,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
      viewBox={`0 0 ${slideWidth} ${slideHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="canvas-grid"
    >
      <defs>
        <pattern id={tileId} width={size} height={size} patternUnits="userSpaceOnUse">
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={ZOOM_LINE_WIDTH / zoom}
          />
        </pattern>
      </defs>
      <g transform={`translate(${pan.x / zoom} ${pan.y / zoom})`}>
        <rect x={0} y={0} width={slideWidth} height={slideHeight} fill={`url(#${tileId})`} />
      </g>
    </svg>
  );
}
