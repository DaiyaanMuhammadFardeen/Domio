/**
 * Annotation tool metadata — shared between InkToolbar and the
 * per-tool components (Pen, Highlighter, Spotlight, ZoomLens, Blur).
 *
 * Per Wave 4 §S4.3 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * The per-tool files (Pen.tsx etc.) are thin presentational wrappers
 * — the actual drawing work happens in AnnotationCanvas. The wrappers
 * exist so each tool has a stable importable surface (for tests and
 * for future per-tool feature flags) without bloating InkToolbar.
 */

import type { AnnotationKind } from '@domio/annotation-engine';

export interface ToolMeta {
  readonly kind: AnnotationKind;
  readonly label: string;
  readonly icon: string;
  /** Short keyboard hint (rendered in tooltips). */
  readonly shortcut: string;
}

export const TOOL_REGISTRY: readonly ToolMeta[] = [
  { kind: 'pen',         label: 'Pen',         icon: '✎', shortcut: 'P' },
  { kind: 'highlighter', label: 'Highlight',   icon: '▮', shortcut: 'H' },
  { kind: 'spotlight',   label: 'Spotlight',   icon: '◉', shortcut: 'S' },
  { kind: 'zoom',        label: 'Zoom lens',   icon: '⊕', shortcut: 'Z' },
  { kind: 'blur',        label: 'Blur region', icon: '▒', shortcut: 'B' },
];

export const COLORS: readonly string[] = [
  '#f85149',
  '#f0883e',
  '#3fb950',
  '#58a6ff',
  '#d2a8ff',
  '#e6edf3',
];

export const DEFAULT_COLOR = '#f85149';
export const DEFAULT_STROKE_WIDTH = 4;