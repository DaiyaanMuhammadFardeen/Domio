'use client';

/**
 * WhisperInbox — non-blocking toast stack for incoming whispers.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from WhisperPanel: the panel is the always-on inbox view
 * (clicker-style); the inbox is a transient toast that pops in the
 * corner when a new whisper arrives, auto-dismisses, and accumulates
 * as a stack. Both share the same WhisperClient transport.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { WhisperClient, type WhisperMessage } from '../../runtime/whisper/whisper-client';

export interface WhisperInboxProps {
  /** Provide a custom client (e.g. for tests). A fresh one is created otherwise. */
  readonly client?: WhisperClient;
  /** Auto-dismiss after this many ms. Default 6 s. */
  readonly dismissAfterMs?: number;
  /** Max toasts shown at once; older ones get evicted. Default 5. */
  readonly maxVisible?: number;
  /** Optional callback fired whenever a new whisper arrives; lets
   *  parent surfaces (e.g. PresenterHUD badge) bump a counter. */
  readonly onWhisper?: (msg: WhisperMessage) => void;
  readonly dataTestId?: string;
}

interface Toast {
  readonly id: string;
  readonly message: WhisperMessage;
  readonly receivedAtMs: number;
}

export function WhisperInbox({
  client,
  dismissAfterMs = 6_000,
  maxVisible = 5,
  onWhisper,
  dataTestId = 'whisper-inbox',
}: WhisperInboxProps): ReactElement | null {
  const c = client ?? new WhisperClient();
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  useEffect(() => {
    const unsub = c.subscribe((m) => {
      const toast: Toast = {
        id: `${m.id}-${m.ts_ms}`,
        message: m,
        receivedAtMs: Date.now(),
      };
      setToasts((prev) => {
        const next = [...prev, toast];
        // Evict oldest beyond maxVisible.
        return next.length > maxVisible ? next.slice(next.length - maxVisible) : next;
      });
      if (onWhisper) onWhisper(m);
    });
    return unsub;
  }, [c, maxVisible, onWhisper]);

  // Auto-dismiss loop.
  useEffect(() => {
    if (toasts.length === 0) return;
    const handle = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.receivedAtMs < dismissAfterMs));
    }, 500);
    return () => clearInterval(handle);
  }, [toasts.length, dismissAfterMs]);

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid={dataTestId}
      role="region"
      aria-label="Whisper inbox toasts"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        zIndex: 1000,
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid={`${dataTestId}-toast`}
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--surface-raised)',
            color: 'var(--content-inverse)',
            padding: '10px 12px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            fontSize: 13,
            lineHeight: 1.4,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            animation: 'whisper-in 200ms ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.85 }}>
              🤫 {t.message.author_display_name ?? t.message.author_id}
            </span>
            <button
              type="button"
              aria-label="Dismiss whisper"
              data-testid={`${dataTestId}-dismiss`}
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
          <div>{t.message.text}</div>
        </div>
      ))}
    </div>
  );
}
