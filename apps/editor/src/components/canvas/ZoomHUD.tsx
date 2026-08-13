/**
 * ZoomHUD — bottom-left pill showing the current zoom percentage
 * and the most-used zoom shortcuts.
 *
 * Wave 2 §S2.1. Reads from `useViewport()` and dispatches back to
 * the same hook (Fit / 100% / 200%). Click the pill to expand an
 * inline numeric input; Enter commits; Escape closes the input
 * without changing the zoom.
 *
 * The HUD is intentionally a thin wrapper — chrome policy lives in
 * the store; this component is presentation + a couple of handlers.
 */

import { useCallback, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { useViewport } from '../../hooks/useViewport';

export interface ZoomHUDProps {
  /** Slide dimensions; needed for Fit. */
  slideWidth: number;
  slideHeight: number;
  /** Viewport dimensions in CSS pixels; needed for Fit. */
  viewportWidth: number;
  viewportHeight: number;
}

function formatPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function ZoomHUD(props: ZoomHUDProps): ReactElement {
  const { slideWidth, slideHeight, viewportWidth, viewportHeight } = props;
  const { zoom, setZoom, fitToSlide, zoomIn, zoomOut } = useViewport();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEditing = useCallback(() => {
    setDraft(String(Math.round(zoom * 100)));
    setEditing(true);
  }, [zoom]);

  const commit = useCallback(() => {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) {
      setZoom(next / 100);
    }
    setEditing(false);
  }, [draft, setZoom]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    },
    [cancel, commit],
  );

  const onFit = useCallback(() => {
    if (slideWidth > 0 && slideHeight > 0) {
      fitToSlide(slideWidth, slideHeight, viewportWidth, viewportHeight);
    }
  }, [fitToSlide, slideHeight, slideWidth, viewportHeight, viewportWidth]);

  return (
    <div
      className="canvas-zoom-hud"
      style={{
        position: 'absolute',
        left: 24,
        bottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: 'var(--surface-base)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 999,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        zIndex: 4,
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: 12,
        color: 'var(--text-primary)',
      }}
      data-testid="canvas-zoom-hud"
    >
      <button type="button" onClick={() => zoomOut()} aria-label="Zoom out" style={zoomButtonStyle}>
        −
      </button>
      {editing ? (
        <input
          type="number"
          autoFocus
          value={draft}
          min={10}
          max={400}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{
            width: 56,
            padding: '2px 4px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            textAlign: 'right',
            background: 'var(--surface-overlay)',
            color: 'var(--text-primary)',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit zoom percentage"
          style={{
            ...zoomButtonStyle,
            minWidth: 48,
          }}
        >
          {formatPercent(zoom)}
        </button>
      )}
      <button type="button" onClick={() => zoomIn()} aria-label="Zoom in" style={zoomButtonStyle}>
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-label="Fit slide to viewport"
        style={zoomButtonStyle}
      >
        Fit
      </button>
      <button
        type="button"
        onClick={() => setZoom(1)}
        aria-label="Zoom to 100%"
        style={zoomButtonStyle}
      >
        100%
      </button>
    </div>
  );
}

const zoomButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 'inherit',
};
