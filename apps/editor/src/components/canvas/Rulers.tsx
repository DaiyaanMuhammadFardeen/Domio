/**
 * Rulers — top + left tick rulers around the canvas viewport.
 *
 * Wave 2 §S2.1. The ruler renders minor ticks every 50 px and major
 * ticks every 100 px in real-pixel space; `useViewport().zoom` scales
 * the tick density so the markings stay readable at any zoom level.
 *
 * Click on the top ruler drops a horizontal guide at the cursor x;
 * click on the left ruler drops a vertical guide at the cursor y.
 * Double-click on a tick that already corresponds to a guide removes
 * the nearest guide instead.
 *
 * The component is intentionally presentational: `useEditorStore`
 * holds the `guides` slice and `addGuide` / `removeGuide` are the
 * only mutations. Tests cover the tick-math helper directly.
 */

import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import { useEditorStore } from '../../store/editor-store';

export interface RulersProps {
  /** Total slide width in CSS pixels before zoom. */
  slideWidth: number;
  /** Total slide height in CSS pixels before zoom. */
  slideHeight: number;
  /** Viewport width (px). */
  viewportWidth: number;
  /** Viewport height (px). */
  viewportHeight: number;
  /** Optional CSS class for the wrapping container. */
  className?: string;
}

const RULER_THICKNESS = 18;

/**
 * Compute the tick spacing that keeps a tick every `targetPx` on
 * screen regardless of zoom. Returns the underlying slide-coord
 * step size; the ruler renders one tick every `step` slide units
 * along the axis.
 */
export function tickStepForZoom(zoom: number, targetPx = 80): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 100;
  const candidates = [10, 25, 50, 100, 200, 500, 1000];
  const step = targetPx / zoom;
  return candidates.find((c) => c >= step) ?? candidates[candidates.length - 1] ?? 100;
}

export function Rulers(props: RulersProps): ReactElement {
  const { slideWidth, slideHeight, viewportWidth, viewportHeight, className } = props;
  const zoom = useEditorStore((s) => s.zoom);
  const pan = useEditorStore((s) => s.pan);
  const guides = useEditorStore((s) => s.guides);
  const addGuide = useEditorStore((s) => s.addGuide);
  const removeGuide = useEditorStore((s) => s.removeGuide);

  const step = tickStepForZoom(zoom);

  // Slide coordinates visible in the viewport along x and y.
  const visibleXStart = -pan.x / zoom;
  const visibleXEnd = (viewportWidth - pan.x) / zoom;
  const visibleYStart = -pan.y / zoom;
  const visibleYEnd = (viewportHeight - pan.y) / zoom;

  const xTicks = useMemo(() => {
    const ticks: Array<{ value: number; major: boolean }> = [];
    const start = Math.floor(visibleXStart / step) * step;
    const end = Math.ceil(visibleXEnd / step) * step;
    for (let v = start; v <= end + 0.0001; v += step) {
      ticks.push({ value: v, major: v % (step * 2) === 0 });
    }
    return ticks;
  }, [step, visibleXEnd, visibleXStart]);

  const yTicks = useMemo(() => {
    const ticks: Array<{ value: number; major: boolean }> = [];
    const start = Math.floor(visibleYStart / step) * step;
    const end = Math.ceil(visibleYEnd / step) * step;
    for (let v = start; v <= end + 0.0001; v += step) {
      ticks.push({ value: v, major: v % (step * 2) === 0 });
    }
    return ticks;
  }, [step, visibleYEnd, visibleYStart]);

  const onTopClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left + (pan.x ?? 0);
      // Slide x for the guide (post-zoom). Rounded to the nearest step
      // so the guide line lands on a grid intersection.
      const slideX = Math.round(x / zoom / step) * step;
      // Avoid duplicates near an existing vertical guide.
      const dup = guides.find(
        (g) => g.orientation === 'vertical' && Math.abs(g.position - slideX) < step / 2,
      );
      if (dup) {
        removeGuide(dup.id);
        return;
      }
      addGuide({ orientation: 'vertical', position: slideX });
    },
    [addGuide, guides, pan.x, removeGuide, step, zoom],
  );

  const onLeftClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top + (pan.y ?? 0);
      const slideY = Math.round(y / zoom / step) * step;
      const dup = guides.find(
        (g) => g.orientation === 'horizontal' && Math.abs(g.position - slideY) < step / 2,
      );
      if (dup) {
        removeGuide(dup.id);
        return;
      }
      addGuide({ orientation: 'horizontal', position: slideY });
    },
    [addGuide, guides, pan.y, removeGuide, step, zoom],
  );

  return (
    <div
      className={className ?? 'canvas-rulers'}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
      aria-hidden="true"
      data-testid="canvas-rulers"
    >
      {/* Top ruler */}
      <div
        onClick={onTopClick}
        style={{
          position: 'absolute',
          left: RULER_THICKNESS,
          top: 0,
          width: viewportWidth - RULER_THICKNESS,
          height: RULER_THICKNESS,
          background: 'var(--surface-base)',
          borderBottom: '1px solid var(--border-subtle)',
          pointerEvents: 'auto',
          cursor: 'crosshair',
          overflow: 'hidden',
        }}
        data-testid="canvas-ruler-top"
      >
        {xTicks.map(({ value, major }) => (
          <div
            key={`x-${value}`}
            style={{
              position: 'absolute',
              left: value * zoom + (pan.x ?? 0),
              top: major ? RULER_THICKNESS - 8 : RULER_THICKNESS - 4,
              width: 1,
              height: major ? 8 : 4,
              background: 'var(--text-secondary)',
            }}
          >
            {major ? (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 3,
                  fontSize: 9,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {Math.round(value)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {/* Left ruler */}
      <div
        onClick={onLeftClick}
        style={{
          position: 'absolute',
          left: 0,
          top: RULER_THICKNESS,
          width: RULER_THICKNESS,
          height: viewportHeight - RULER_THICKNESS,
          background: 'var(--surface-base)',
          borderRight: '1px solid var(--border-subtle)',
          pointerEvents: 'auto',
          cursor: 'crosshair',
          overflow: 'hidden',
        }}
        data-testid="canvas-ruler-left"
      >
        {yTicks.map(({ value, major }) => (
          <div
            key={`y-${value}`}
            style={{
              position: 'absolute',
              top: value * zoom + (pan.y ?? 0),
              left: major ? RULER_THICKNESS - 8 : RULER_THICKNESS - 4,
              height: 1,
              width: major ? 8 : 4,
              background: 'var(--text-secondary)',
            }}
          >
            {major ? (
              <span
                style={{
                  position: 'absolute',
                  left: 2,
                  top: 3,
                  fontSize: 9,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {Math.round(value)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {/* Top-left corner */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: RULER_THICKNESS,
          height: RULER_THICKNESS,
          background: 'var(--surface-base)',
          borderRight: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          pointerEvents: 'none',
        }}
      />
      {/* Slide bounds overlay reference (so devs can see the live
          bounds without reading from the SVG below). */}
      <div
        style={{
          position: 'absolute',
          left: RULER_THICKNESS,
          top: RULER_THICKNESS,
          width: slideWidth * zoom,
          height: slideHeight * zoom,
          outline: '1px dashed var(--border-subtle)',
          pointerEvents: 'none',
        }}
        data-testid="canvas-slide-bounds"
      />
    </div>
  );
}
