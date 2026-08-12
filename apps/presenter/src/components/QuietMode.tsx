'use client';

/**
 * QuietMode — silences all toasts + whispers during sensitive moments.
 *
 * Per Wave 4 §S4.14 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * When the presenter toggles Quiet Mode on:
 *   - Whisper toasts are suppressed.
 *   - Audience participation toasts are suppressed.
 *   - Phone vibration on pacing checkpoints is suppressed.
 *   - A small persistent badge appears so the presenter remembers the
 *     mode is on (so a teammate's whisper doesn't get silently lost).
 *
 * The component does NOT block the underlying state — it emits
 * `onChange(quiet)` and the parent decides which side effects to
 * silence. The badge is always visible when quiet is true.
 */

import { useCallback, type ReactElement } from 'react';

export interface QuietModeProps {
  readonly quiet: boolean;
  readonly onChange?: (quiet: boolean) => void;
  readonly dataTestId?: string;
}

export function QuietMode({
  quiet,
  onChange,
  dataTestId = 'quiet-mode',
}: QuietModeProps): ReactElement {
  const toggle = useCallback(() => {
    onChange?.(!quiet);
  }, [quiet, onChange]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={quiet}
      data-testid={dataTestId}
      data-quiet={quiet}
      onClick={toggle}
      title="Quiet mode silences all toasts & whispers"
      style={{
        padding: '6px 10px',
        border: `1px solid ${quiet ? 'var(--success)' : 'var(--border-subtle)'}`,
        borderRadius: 4,
        background: quiet ? 'var(--success)' : 'var(--surface-raised)',
        color: quiet ? 'var(--content-inverse)' : 'var(--content-primary)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span aria-hidden>{quiet ? '🤫' : '🔔'}</span>
      {quiet ? 'Quiet' : 'Quiet mode'}
    </button>
  );
}

export interface QuietModeBadgeProps {
  readonly quiet: boolean;
  readonly dataTestId?: string;
}

export function QuietModeBadge({ quiet, dataTestId = 'quiet-mode-badge' }: QuietModeBadgeProps): ReactElement | null {
  if (!quiet) return null;
  return (
    <span
      data-testid={dataTestId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        background: 'var(--success)',
        color: 'var(--content-inverse)',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span aria-hidden>🤫</span>
      Quiet
    </span>
  );
}