'use client';

/**
 * OfflineCache — banner that surfaces the offline / cached-deck status.
 *
 * Per Wave 4 §S4.9 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Reads the underlying OfflineCache service (set up at app start) and
 * surfaces a top banner when:
 *   - The deck hasn't been fully cached yet (preparing)
 *   - The browser went offline after the deck was cached (offline)
 *   - A live refresh just succeeded (online — banner hidden)
 *
 * The underlying cache lives in `offline-cache.ts` (PWA service worker
 * bootstrap). This component is the visible surface.
 */

import { useEffect, useState, type ReactElement } from 'react';

export type OfflineStatus = 'preparing' | 'online' | 'offline' | 'stale';

export interface OfflineCacheProps {
  readonly status?: OfflineStatus;
  readonly cachedSlideCount?: number;
  readonly totalSlideCount?: number;
  readonly onReconnect?: () => void;
  readonly dataTestId?: string;
}

export function OfflineCache({
  status = 'online',
  cachedSlideCount = 0,
  totalSlideCount = 0,
  onReconnect,
  dataTestId = 'offline-cache',
}: OfflineCacheProps): ReactElement | null {
  // Force a re-render every 5 s while preparing so the progress bar
  // visibly moves when the SW reports new chunk downloads. The
  // tick value itself is unused — its purpose is to invalidate the
  // cached `pct` calculation below.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'preparing') return;
    const handle = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(handle);
  }, [status]);

  if (status === 'online') return null;

  const isOffline = status === 'offline' || status === 'stale';
  const pct =
    totalSlideCount > 0
      ? Math.round((cachedSlideCount / totalSlideCount) * 100)
      : 0;

  return (
    <div
      data-testid={dataTestId}
      data-status={status}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        padding: '8px 12px',
        background: isOffline ? 'var(--danger)' : 'var(--info)',
        color: 'var(--content-inverse)',
        borderRadius: 6,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 1100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span aria-hidden>{isOffline ? '⚠️' : '⏳'}</span>
      <span>
        {status === 'preparing' && `Caching deck ${pct}% (${cachedSlideCount}/${totalSlideCount})`}
        {status === 'offline' && 'Offline — running from cached snapshot.'}
        {status === 'stale' && 'Reconnecting — running from last good snapshot.'}
      </span>
      {isOffline && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          data-testid={`${dataTestId}-reconnect`}
          style={{
            padding: '2px 8px',
            border: '1px solid var(--content-inverse)',
            background: 'transparent',
            color: 'var(--content-inverse)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Reconnect
        </button>
      )}
    </div>
  );
}