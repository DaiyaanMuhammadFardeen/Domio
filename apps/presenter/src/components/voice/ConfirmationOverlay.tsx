'use client';

/**
 * ConfirmationOverlay — appears when a voice match is detected.
 *
 * Per Wave 11 §S11.5, every match must be confirmed before being
 * applied to avoid accidental slide/scenario changes. The overlay
 * shows the recognized phrase, the suggested action, and two buttons
 * (Confirm / Reject). It auto-dismisses after 5 seconds.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { VoiceAction, VoiceMatch } from '../../lib/voice-service';

export interface ConfirmationOverlayProps {
  readonly match: VoiceMatch | null;
  readonly autoDismissMs?: number;
  readonly heading?: string;
  readonly confirmLabel?: string;
  readonly rejectLabel?: string;
  readonly onConfirm?: (match: VoiceMatch) => void;
  readonly onReject?: (match: VoiceMatch) => void;
  readonly onAutoDismiss?: (match: VoiceMatch) => void;
  readonly dataTestId?: string;
}

const DEFAULT_AUTO_DISMISS_MS = 5_000;

function describeAction(action: VoiceAction, target: string): string {
  switch (action) {
    case 'scenario_toggle':
      return target ? `Switch to ${target} scenario` : 'Toggle scenario';
    case 'slide_jump':
      return target ? `Jump to slide ${target}` : 'Jump to slide';
    case 'poll_launch':
      return 'Launch a poll';
    case 'goto_section':
      return target ? `Go to ${target} section` : 'Go to section';
    case 'mute':
      return 'Mute mic';
  }
}

export function ConfirmationOverlay({
  match,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  heading = 'Did you mean to…',
  confirmLabel = 'Confirm',
  rejectLabel = 'Reject',
  onConfirm,
  onReject,
  onAutoDismiss,
  dataTestId = 'voice-confirmation-overlay',
}: ConfirmationOverlayProps): ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [remainingMs, setRemainingMs] = useState(autoDismissMs);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!match) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    lastMatchIdRef.current = match.id;
    setRemainingMs(autoDismissMs);

    const startedAt = Date.now();
    const handle = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, autoDismissMs - elapsed);
      setRemainingMs(remaining);
      if (remaining === 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        const id = lastMatchIdRef.current;
        lastMatchIdRef.current = null;
        if (id && match.id === id) {
          onAutoDismiss?.(match);
        }
      }
    }, 250);
    timerRef.current = handle;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [match, autoDismissMs, onAutoDismiss]);

  if (!match || !mounted) return null;

  const suggestedAction = describeAction(match.action, match.target);
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dataTestId}-heading`}
      aria-describedby={`${dataTestId}-recognized`}
      data-testid={dataTestId}
      data-match-id={match.id}
      data-action={match.action}
      data-confidence={match.confidence}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        background: 'var(--surface-base)',
        color: 'var(--content-primary)',
        padding: 16,
        borderRadius: 8,
        width: 320,
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        border: '1px solid var(--border-subtle)',
        zIndex: 1400,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <strong
          id={`${dataTestId}-heading`}
          style={{ fontSize: 13, fontWeight: 700 }}
        >
          {heading}
        </strong>
        <span
          data-testid={`${dataTestId}-countdown`}
          style={{ fontSize: 11, opacity: 0.7 }}
        >
          {seconds}s
        </span>
      </div>
      <div
        id={`${dataTestId}-recognized`}
        data-testid={`${dataTestId}-recognized`}
        style={{ fontSize: 12, marginBottom: 4 }}
      >
        Heard: <q style={{ fontStyle: 'italic' }}>{match.phrase}</q>
      </div>
      <div
        data-testid={`${dataTestId}-suggested`}
        style={{ fontSize: 12, marginBottom: 12, fontWeight: 600 }}
      >
        → {suggestedAction}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid={`${dataTestId}-reject`}
          onClick={() => onReject?.(match)}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--content-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {rejectLabel}
        </button>
        <button
          type="button"
          data-testid={`${dataTestId}-confirm`}
          onClick={() => onConfirm?.(match)}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 4,
            background: 'var(--accent-primary)',
            color: 'var(--content-inverse)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}