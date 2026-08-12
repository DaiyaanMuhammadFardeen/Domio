/**
 * Guides — overlay lines for every stored guide.
 *
 * Wave 2 §S2.1. `Rulers` mutates the guides slice via `addGuide` /
 * `removeGuide`; `Guides` renders the resulting lines as an SVG
 * overlay over the slide. Double-click removes the nearest guide.
 *
 * The component is intentionally presentational — no local state.
 */

import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useViewport } from '../../hooks/useViewport';

export interface GuidesProps {
  /** Width in slide units. */
  slideWidth: number;
  /** Height in slide units. */
  slideHeight: number;
}

export function Guides(props: GuidesProps): ReactElement {
  const { slideWidth, slideHeight } = props;
  const guides = useEditorStore((s) => s.guides);
  const removeGuide = useEditorStore((s) => s.removeGuide);
  const { zoom, pan } = useViewport();

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<SVGLineElement>, id: string) => {
      event.preventDefault();
      event.stopPropagation();
      removeGuide(id);
    },
    [removeGuide],
  );

  // Render in slide units inside an SVG whose viewBox is the slide
  // bounds. The outer wrapper applies the zoom + pan transform so
  // guide lines track the canvas exactly.
  return (
    <svg
      className="canvas-guides"
      style={{
        position: 'absolute',
        left: 18,
        top: 18,
        width: slideWidth * zoom,
        height: slideHeight * zoom,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 2,
      }}
      viewBox={`0 0 ${slideWidth} ${slideHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="canvas-guides"
    >
      <g transform={`translate(${pan.x / zoom} ${pan.y / zoom})`}>
        {guides.map((g) => {
          if (g.orientation === 'vertical') {
            return (
              <line
                key={g.id}
                x1={g.position}
                x2={g.position}
                y1={0}
                y2={slideHeight}
                stroke="var(--accent-magenta)"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                style={{ pointerEvents: 'stroke', cursor: 'ew-resize' }}
                onDoubleClick={(e) => onDoubleClick(e, g.id)}
                data-guide-id={g.id}
              />
            );
          }
          return (
            <line
              key={g.id}
              x1={0}
              x2={slideWidth}
              y1={g.position}
              y2={g.position}
              stroke="var(--accent-magenta)"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
              style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
              onDoubleClick={(e) => onDoubleClick(e, g.id)}
              data-guide-id={g.id}
            />
          );
        })}
      </g>
    </svg>
  );
}