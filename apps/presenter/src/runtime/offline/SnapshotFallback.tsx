'use client';

/**
 * SnapshotFallback — chart / data display with a "stale" badge.
 *
 * Per Wave 4 §S4.9 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Wraps a children block (the chart renderer) with a "stale" badge
 * when the data is from the last cached snapshot rather than the
 * live source. Lets presenters know the number they just cited may
 * be out of date.
 */

import type { ReactElement, ReactNode } from 'react';

export interface SnapshotFallbackProps {
  readonly isStale: boolean;
  readonly lastFreshAtMs?: number;
  readonly children: ReactNode;
  readonly dataTestId?: string;
}

export function SnapshotFallback({
  isStale,
  lastFreshAtMs,
  children,
  dataTestId = 'snapshot-fallback',
}: SnapshotFallbackProps): ReactElement {
  const label = lastFreshAtMs
    ? `Stale (last fresh ${new Date(lastFreshAtMs).toLocaleTimeString()})`
    : 'Stale';

  return (
    <div data-testid={dataTestId} data-stale={isStale} style={{ position: 'relative' }}>
      {children}
      {isStale && (
        <span
          data-testid={`${dataTestId}-badge`}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            padding: '1px 6px',
            background: 'var(--warning)',
            color: 'var(--content-inverse)',
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
