'use client';

/**
 * FailoverBanner — sticky banner shown on the audience display when
 * the presenter's primary device loses the session.
 *
 * Per Wave 4 §S4.8 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * The audience sees a calm placeholder (the slide content stays put)
 * plus a small banner explaining the presenter is reconnecting.
 * After the configured `reconnectDeadlineMs`, the banner switches to
 * "session lost" mode and stops accepting input.
 */

import { useEffect, useState, type ReactElement } from 'react';

export interface FailoverBannerProps {
  readonly state: 'reconnecting' | 'lost' | 'resumed';
  readonly reconnectDeadlineMs?: number;
  readonly onDismiss?: () => void;
  readonly dataTestId?: string;
}

const DEFAULT_DEADLINE_MS = 15_000;

export function FailoverBanner({
  state,
  reconnectDeadlineMs = DEFAULT_DEADLINE_MS,
  onDismiss,
  dataTestId = 'failover-banner',
}: FailoverBannerProps): ReactElement | null {
  const [remainingMs, setRemainingMs] = useState(reconnectDeadlineMs);

  useEffect(() => {
    if (state !== 'reconnecting') return;
    setRemainingMs(reconnectDeadlineMs);
    const handle = setInterval(() => {
      setRemainingMs((ms) => Math.max(0, ms - 250));
    }, 250);
    return () => clearInterval(handle);
  }, [state, reconnectDeadlineMs]);

  if (state === 'resumed') return null;

  const isReconnecting = state === 'reconnecting';
  const secs = Math.ceil(remainingMs / 1000);
  const headline = isReconnecting ? 'Presenter reconnecting…' : 'Session lost';
  const detail = isReconnecting
    ? `The presenter’s laptop dropped. Slides stay put — they’ll be back in ${secs}s.`
    : 'The presenter couldn’t reconnect in time. The session is in read-only mode.';

  return (
    <div
      data-testid={dataTestId}
      data-state={state}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '10px 16px',
        background: isReconnecting ? 'var(--warning)' : 'var(--danger)',
        color: 'var(--content-inverse)',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 1200,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      <div>
        <div>{headline}</div>
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>{detail}</div>
      </div>
      {onDismiss && state === 'lost' && (
        <button
          type="button"
          onClick={onDismiss}
          data-testid={`${dataTestId}-dismiss`}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--content-inverse)',
            borderRadius: 4,
            color: 'var(--content-inverse)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
