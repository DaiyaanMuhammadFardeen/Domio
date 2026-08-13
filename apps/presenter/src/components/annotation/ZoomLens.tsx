'use client';

/**
 * Zoom lens tool — magnifier that follows the cursor.
 *
 * Per Wave 4 §S4.3 of docs/frontend-roadmap/04-wave-presenter-live.md.
 */

import type { ReactElement } from 'react';
import { TOOL_REGISTRY } from './tools';
import type { AnnotationKind } from '@domio/annotation-engine';

const META = TOOL_REGISTRY.find((t) => t.kind === 'zoom')!;

export interface ZoomLensProps {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly onSelect?: (kind: AnnotationKind) => void;
  readonly dataTestId?: string;
}

export function ZoomLens({
  active,
  disabled = false,
  onSelect,
  dataTestId = 'annotation-tool-zoom',
}: ZoomLensProps): ReactElement {
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
