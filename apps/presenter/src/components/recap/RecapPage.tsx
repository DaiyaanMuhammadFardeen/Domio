'use client';

/**
 * RecapPage — post-session recap dashboard.
 *
 * Phase 15 W15. The presenter opens this after ending a session. It
 * surfaces:
 *   - duration + total slide count
 *   - per-slide dwell time (top 5 slowest)
 *   - parking-lot open + pinned items
 *   - saved annotations (deferred to P16 W4 for richer view)
 *   - audience summary (populated when P16 W9 wires feedback)
 *
 * The page is a self-contained component that calls RecapClient.fetch()
 * on mount and renders the result. It's mounted by the presenter view
 * when the session is ended.
 */

import { useEffect, useState } from 'react';
import { RecapClient, type RecapSummary } from '../../lib/recap-service';
import { RecordingExportButton } from './RecordingExportButton';

export interface RecapPageProps {
  sessionId: string;
  apiBaseUrl?: string;
  onClose: () => void;
}

export function RecapPage({ sessionId, apiBaseUrl, onClose }: RecapPageProps) {
  const client = new RecapClient({ baseUrl: apiBaseUrl ?? '' });
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .fetch(sessionId)
      .then(setSummary)
      .catch((e) => setError((e as Error).message));
  }, [client, sessionId]);

  const topSlides = summary
    ? Object.entries(summary.per_slide_ms)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  return (
    <section className="recap-page" aria-label="Session recap">
      <header className="recap-page__header">
        <h2>Session recap</h2>
        <button
          type="button"
          className="recap-page__close"
          onClick={onClose}
          aria-label="Close recap"
        >
          ✕
        </button>
      </header>
      {error && <div className="recap-page__error">{error}</div>}
      {!summary && !error && <div className="recap-page__loading">Loading recap…</div>}
      {summary && (
        <div className="recap-page__grid">
          <div className="recap-card">
            <div className="recap-card__label">Duration</div>
            <div className="recap-card__value">{formatDuration(summary.duration_ms)}</div>
          </div>
          <div className="recap-card">
            <div className="recap-card__label">Slides shown</div>
            <div className="recap-card__value">{summary.slides_shown.length}</div>
          </div>
          <div className="recap-card">
            <div className="recap-card__label">Skipped</div>
            <div className="recap-card__value">{summary.slides_skipped.length}</div>
          </div>
          <div className="recap-card">
            <div className="recap-card__label">Parking lot</div>
            <div className="recap-card__value">
              {summary.parking_lot_open.length + summary.parking_lot_pinned.length}
            </div>
          </div>
          <div className="recap-card recap-card--wide">
            <div className="recap-card__label">Slowest slides</div>
            <ul className="recap-card__list">
              {topSlides.length === 0 && <li>No slide timing recorded.</li>}
              {topSlides.map(([id, ms]) => (
                <li key={id}>
                  <span className="recap-card__slide-id">{id}</span>
                  <span className="recap-card__ms">{formatDuration(ms)}</span>
                </li>
              ))}
            </ul>
          </div>
          {summary.parking_lot_pinned.length > 0 && (
            <div className="recap-card recap-card--wide">
              <div className="recap-card__label">Pinned parking lot items</div>
              <ul className="recap-card__list">
                {summary.parking_lot_pinned.map((id) => (
                  <li key={id}>
                    <span className="recap-card__slide-id">{id}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <RecordingExportButton
        sessionId={sessionId}
        {...(apiBaseUrl !== undefined ? { apiBaseUrl } : {})}
      />
    </section>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}m ${String(remS).padStart(2, '0')}s`;
}
