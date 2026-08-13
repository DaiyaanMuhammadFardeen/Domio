'use client';

/**
 * OutputMirrorControls — mirror / extend / audience-only toggle + target picker.
 *
 * Per Wave 4 §S4.10 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Three display modes the presenter can flip between:
 *   - extend          → laptop + audience screen show different content
 *                       (confidence monitor on laptop; full slide on audience).
 *   - clone           → laptop mirrors the audience screen (1:1).
 *   - audience_only   → laptop goes dark; only the audience screen renders
 *                       the slide. Useful for kiosk mode or LED walls.
 *
 * The picker lists every display the runtime knows about (passed via
 * `availableDisplays`) plus the auto-detected window.screen fallback.
 * Each display entry has an `id`, optional label, and rough resolution.
 */

import { useCallback, useState, type ReactElement } from 'react';
import type { DisplayProfileSnapshot } from '../../runtime/types';

export type MirrorMode = DisplayProfileSnapshot['mirror_mode'];

export interface DisplayTarget {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export interface OutputMirrorControlsProps {
  readonly mode: MirrorMode;
  readonly targetId?: string;
  readonly availableDisplays?: readonly DisplayTarget[];
  readonly onChange?: (mode: MirrorMode, targetId: string | undefined) => void;
  readonly dataTestId?: string;
}

const MODES: ReadonlyArray<{ id: MirrorMode; label: string; hint: string }> = [
  { id: 'extend', label: 'Extend', hint: 'Confidence monitor on laptop, slide on audience.' },
  { id: 'clone', label: 'Clone', hint: 'Both screens show the same content.' },
  {
    id: 'audience_only',
    label: 'Audience only',
    hint: 'Laptop dark; only the audience screen renders.',
  },
];

export function OutputMirrorControls({
  mode,
  targetId,
  availableDisplays = [],
  onChange,
  dataTestId = 'output-mirror-controls',
}: OutputMirrorControlsProps): ReactElement {
  const [internalMode, setInternalMode] = useState<MirrorMode>(mode);
  const [internalTarget, setInternalTarget] = useState<string | undefined>(targetId);

  const setMode = useCallback(
    (next: MirrorMode) => {
      setInternalMode(next);
      onChange?.(next, internalTarget);
    },
    [internalTarget, onChange],
  );

  const setTarget = useCallback(
    (next: string | undefined) => {
      setInternalTarget(next);
      onChange?.(internalMode, next);
    },
    [internalMode, onChange],
  );

  const fallback: DisplayTarget[] =
    availableDisplays.length > 0
      ? []
      : [
          {
            id: 'laptop',
            label: 'Built-in laptop screen',
            width: typeof window !== 'undefined' ? (window.screen?.width ?? 1920) : 1920,
            height: typeof window !== 'undefined' ? (window.screen?.height ?? 1080) : 1080,
          },
        ];

  const displays = availableDisplays.length > 0 ? [...availableDisplays] : fallback;

  return (
    <section
      data-testid={dataTestId}
      data-mode={internalMode}
      data-target={internalTarget ?? ''}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <header>
        <strong style={{ fontSize: 13 }}>Output mirror</strong>
      </header>

      <div role="radiogroup" aria-label="Mirror mode" style={{ display: 'flex', gap: 6 }}>
        {MODES.map((m) => {
          const active = internalMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`${dataTestId}-${m.id}`}
              onClick={() => setMode(m.id)}
              style={{
                flex: 1,
                padding: '6px 8px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                background: active ? 'var(--info)' : 'var(--surface-raised)',
                color: active ? 'var(--content-inverse)' : 'var(--content-primary)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
              title={m.hint}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <label
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 11,
          color: 'var(--content-secondary)',
        }}
      >
        Audience display
        <select
          value={internalTarget ?? ''}
          onChange={(e) => setTarget(e.target.value || undefined)}
          data-testid={`${dataTestId}-target`}
          style={{
            padding: '4px 6px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 3,
            background: 'var(--surface-raised)',
            color: 'var(--content-primary)',
            fontSize: 12,
          }}
        >
          <option value="">— auto-detect —</option>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({d.width}×{d.height})
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
