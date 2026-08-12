'use client';

/**
 * Pen tool — opaque ink strokes.
 *
 * Per Wave 4 §S4.3 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * This is a presentational component (the icon + label + selected
 * state). The actual stroke capture happens in `AnnotationCanvas`.
 */

import type { ReactElement } from 'react';
import { TOOL_REGISTRY } from './tools';
import type { AnnotationKind } from '@domio/annotation-engine';

const META = TOOL_REGISTRY.find((t) => t.kind === 'pen')!;

export interface PenProps {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly onSelect?: (kind: AnnotationKind) => void;
  readonly dataTestId?: string;
}

export function Pen({
  active,
  disabled = false,
  onSelect,
  dataTestId = 'annotation-tool-pen',
}: PenProps): ReactElement {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      aria-label={META.label}
      aria-pressed={active}
      title={`${META.label} (${META.shortcut})`}
      disabled={disabled}
      onClick={() => onSelect?.(META.kind)}
      style={{
        padding: '4px 8px',
        border: '1px solid var(--border-default)',
        background: active ? 'var(--surface-raised)' : 'var(--surface-base)',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
      }}
    >
      <span aria-hidden>{META.icon}</span> {META.label}
    </button>
  );
}