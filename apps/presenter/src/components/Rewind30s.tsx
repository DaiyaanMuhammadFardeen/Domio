'use client';

/**
 * Rewind30s — jump back 30 seconds in the audience screen.
 *
 * Per Wave 4 §S4.13 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Two triggers:
 *   - Toolbar button (rendered as a small pill).
 *   - Cmd/Ctrl + `[` keyboard chord (mounted via a window keydown
 *     listener; parents are expected to render the button but the
 *     keydown listener is registered regardless).
 *
 * `onRewind(30_000)` fires the callback with the requested lookback.
 * Parent decides whether to rewind slide position, scrub annotation
 * playback, replay audio, etc.
 */

import { useCallback, useEffect, type ReactElement } from 'react';

export interface Rewind30sProps {
  readonly lookbackMs?: number;
  readonly onRewind?: (lookbackMs: number) => void;
  readonly dataTestId?: string;
}

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export function Rewind30s({
  lookbackMs = 30_000,
  onRewind,
  dataTestId = 'rewind-30s',
}: Rewind30sProps): ReactElement {
  const trigger = useCallback(() => {
    onRewind?.(lookbackMs);
  }, [lookbackMs, onRewind]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      if (mod && e.key === '[') {
        e.preventDefault();
        trigger();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [trigger]);

  return (
    <button
      type="button"
      data-testid={dataTestId}
      data-lookback-ms={lookbackMs}
      onClick={trigger}
      title="Rewind 30 seconds (Cmd/Ctrl + [)"
      style={{
        padding: '6px 10px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        background: 'var(--surface-raised)',
        color: 'var(--content-primary)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      ⟲ Rewind {Math.round(lookbackMs / 1000)}s
    </button>
  );
}