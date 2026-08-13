'use client';

/**
 * AnnotationLayer — composite of the five tool buttons.
 *
 * Per Wave 4 §S4.3 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Renders Pen / Highlighter / Spotlight / ZoomLens / Blur as a single
 * toolbar row. The active kind is highlighted; clicking a button calls
 * `onToolChange(kind)` so the parent (AnnotationOverlay) can swap the
 * active tool. `onClear` deselects all tools.
 */

import type { ReactElement } from 'react';
import type { AnnotationKind } from '@domio/annotation-engine';
import { Pen } from './Pen';
import { Highlighter } from './Highlighter';
import { Spotlight } from './Spotlight';
import { ZoomLens } from './ZoomLens';
import { Blur } from './Blur';

export interface AnnotationLayerProps {
  readonly active: AnnotationKind | null;
  readonly disabled?: boolean;
  readonly onToolChange: (kind: AnnotationKind | null) => void;
  readonly dataTestId?: string;
}

export function AnnotationLayer({
  active,
  disabled = false,
  onToolChange,
  dataTestId = 'annotation-layer',
}: AnnotationLayerProps): ReactElement {
  return (
    <div
      data-testid={dataTestId}
      role="toolbar"
      aria-label="Annotation tools"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: 4,
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        background: 'var(--surface-base)',
      }}
    >
      <Pen active={active === 'pen'} disabled={disabled} onSelect={onToolChange} />
      <Highlighter active={active === 'highlighter'} disabled={disabled} onSelect={onToolChange} />
      <Spotlight active={active === 'spotlight'} disabled={disabled} onSelect={onToolChange} />
      <ZoomLens active={active === 'zoom'} disabled={disabled} onSelect={onToolChange} />
      <Blur active={active === 'blur'} disabled={disabled} onSelect={onToolChange} />
      {active !== null && (
        <button
          type="button"
          data-testid={`${dataTestId}-clear`}
          onClick={() => onToolChange(null)}
          aria-label="Clear active tool"
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          ✕ clear
        </button>
      )}
    </div>
  );
}

export { Pen, Highlighter, Spotlight, ZoomLens, Blur };
export { TOOL_REGISTRY, COLORS, DEFAULT_COLOR, DEFAULT_STROKE_WIDTH } from './tools';
