'use client';

/**
 * Canvas controls panel — toggles for rulers, grid, and snap; the
 * shortcut cheat-sheet shown next to each toggle.
 *
 * Wave 2 §S2.1. The panel renders inside the left rail; the
 * `CanvasChromeToggles` group renders three switch rows. The
 * shortcuts shown are sourced from `editor-shortcuts.ts` so the
 * panel and the actual listener can never drift.
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import { useEditorStore } from '../store/editor-store';
import { DEFAULT_EDITOR_SHORTCUTS } from '../editor-shortcuts';
import { useViewport } from '../hooks/useViewport';

function shortcutFor(id: string): string {
  const entry = DEFAULT_EDITOR_SHORTCUTS.find((d) => d.id === id);
  return entry?.chord ?? '';
}

interface ViewportDims {
  width: number;
  height: number;
}

function useViewportDims(): ViewportDims {
  const [dims, setDims] = useState<ViewportDims>({ width: 1024, height: 768 });
  useEffect(() => {
    const update = () => setDims({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return dims;
}

export function CanvasControlsPanel(): ReactElement {
  const showRulers = useEditorStore((s) => s.showRulers);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleRulers = useEditorStore((s) => s.toggleRulers);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const { zoom, setZoom, fitToSlide } = useViewport();
  const dims = useViewportDims();

  return (
    <section
      className="panel-canvas-controls"
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          <FormattedMessage id="editor.canvasControls.title" />
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          <FormattedMessage id="editor.canvasControls.subtitle" />
        </p>
      </header>
      <ToggleRow
        labelId="editor.canvasControls.rulers"
        checked={showRulers}
        onChange={toggleRulers}
        shortcut={shortcutFor('toggle-rulers')}
      />
      <ToggleRow
        labelId="editor.canvasControls.grid"
        checked={showGrid}
        onChange={toggleGrid}
        shortcut={shortcutFor('toggle-grid')}
      />
      <ToggleRow
        labelId="editor.canvasControls.snap"
        checked={snapEnabled}
        onChange={toggleSnap}
        shortcut={shortcutFor('toggle-snap')}
      />
      <hr
        style={{
          border: 0,
          borderTop: '1px solid var(--border-subtle)',
          margin: '4px 0',
        }}
      />
      <section>
        <h4 style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          <FormattedMessage id="editor.canvasControls.zoom" />
        </h4>
        <p style={{ margin: '4px 0 6px', fontSize: 12 }}>{`${Math.round(zoom * 100)}%`}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setZoom(1)} style={buttonStyle}>
            100%
          </button>
          <button type="button" onClick={() => setZoom(2)} style={buttonStyle}>
            200%
          </button>
          <button
            type="button"
            onClick={() => fitToSlide(1600, 900, dims.width, dims.height)}
            style={buttonStyle}
          >
            Fit
          </button>
        </div>
      </section>
    </section>
  );
}

interface ToggleRowProps {
  labelId: string;
  checked: boolean;
  onChange: () => void;
  shortcut: string;
}

function ToggleRow(props: ToggleRowProps): ReactElement {
  const { labelId, checked, onChange, shortcut } = props;
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={checked} onChange={onChange} aria-labelledby={labelId} />
        <FormattedMessage id={labelId} />
      </span>
      {shortcut ? (
        <kbd
          style={{
            padding: '2px 6px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            background: 'var(--surface-overlay)',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {shortcut}
        </kbd>
      ) : null}
    </label>
  );
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};
