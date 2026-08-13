'use client';

/**
 * InkToolbar — presenter-side toolbar with the five annotation tools.
 *
 * Renders 5 buttons + a color swatch row + stroke-width slider. Tool
 * selection drives `tool` on the AnnotationCanvas (which gates
 * pointer-events). On selecting pen/highlighter, the toolbar also
 * exposes an "Undo" affordance that rolls back the most recent
 * ephemeral stroke, and a "Save to slide" affordance for promoting
 * the latest stroke to a saved overlay.
 *
 * Style matches the rest of the presenter chrome.
 */

import type { AnnotationKind } from '@domio/annotation-engine';

export interface InkToolbarProps {
  tool: AnnotationKind | null;
  color: string;
  strokeWidth: number;
  onToolChange: (tool: AnnotationKind | null) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo?: () => void;
  onSave?: () => void;
  canUndo?: boolean;
  canSave?: boolean;
  /** When true, the toolbar is disabled (e.g. session ended). */
  disabled?: boolean;
}

const TOOLS: Array<{ kind: AnnotationKind | null; label: string; icon: string }> = [
  { kind: null, label: 'None', icon: '∅' },
  { kind: 'pen', label: 'Pen', icon: '✎' },
  { kind: 'highlighter', label: 'Highlight', icon: '▮' },
  { kind: 'spotlight', label: 'Spotlight', icon: '◉' },
  { kind: 'zoom', label: 'Zoom', icon: '⊕' },
  { kind: 'blur', label: 'Blur', icon: '▒' },
];

const COLORS = ['#f85149', '#f0883e', '#3fb950', '#58a6ff', '#d2a8ff', '#e6edf3'];

export function InkToolbar(props: InkToolbarProps) {
  const {
    tool,
    color,
    strokeWidth,
    onToolChange,
    onColorChange,
    onStrokeWidthChange,
    onUndo,
    onSave,
    canUndo,
    canSave,
    disabled,
  } = props;
  return (
    <div className="ink-toolbar" role="toolbar" aria-label="Annotation toolbar">
      <div className="ink-toolbar__group">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            className={`ink-toolbar__btn ${tool === t.kind ? 'ink-toolbar__btn--active' : ''}`}
            onClick={() => onToolChange(t.kind)}
            disabled={disabled}
            aria-label={t.label}
            title={t.label}
          >
            <span aria-hidden>{true}</span>
            {t.icon}
          </button>
        ))}
      </div>
      <div className="ink-toolbar__group">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`ink-toolbar__swatch ${color === c ? 'ink-toolbar__swatch--active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
            disabled={disabled}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="ink-toolbar__group ink-toolbar__group--slider">
        <label htmlFor="ink-width" className="ink-toolbar__label">
          Width
        </label>
        <input
          id="ink-width"
          type="range"
          min={1}
          max={24}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          disabled={disabled}
        />
        <span className="ink-toolbar__value">{strokeWidth}px</span>
      </div>
      <div className="ink-toolbar__group ink-toolbar__group--actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          aria-label="Undo last stroke"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || !canSave}
          aria-label="Save to slide"
        >
          ⭐ Save to slide
        </button>
      </div>
    </div>
  );
}
