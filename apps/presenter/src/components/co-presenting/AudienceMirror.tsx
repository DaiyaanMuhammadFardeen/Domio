'use client';

/**
 * AudienceMirror — small grid showing 2–4 sample audience viewports.
 *
 * Per Wave 11 §S11.9 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Each tile shows:
 *   - A miniature "slide preview" (just a colored block + slide number;
 *     we don't render the full slide for performance).
 *   - The region name.
 *   - The current latency_ms for that region.
 *   - A tap-to-fullscreen button that opens a simple modal.
 *
 * The grid updates via the same `listAudienceViewports` /
 * `listRegionLatencies` service calls used by SyncStatus and
 * LatencyMonitor. We refresh every 4s by default — slower than the
 * latency monitor so the viewport tiles don't strobe.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  listAudienceViewports,
  listRegionLatencies,
  type AudienceViewport,
  type RegionLatency,
} from '../../lib/co-presenting-service';

export interface AudienceMirrorProps {
  sessionId: string;
  /** Polling interval (ms). Default 4000. */
  pollMs?: number;
  /** Optional override for the viewport list (skips the network call). */
  viewports?: AudienceViewport[];
  /** Optional override for the latency list (skips the network call). */
  latencies?: RegionLatency[];
  readonly labels?: Partial<{
    heading: string;
    empty: string;
    fullscreen: string;
    close: string;
    latencySuffix: string;
  }>;
  readonly dataTestId?: string;
}

const DEFAULT_LABELS: Required<NonNullable<AudienceMirrorProps['labels']>> = {
  heading: 'Audience viewports',
  empty: 'No audience viewers yet.',
  fullscreen: 'View fullscreen',
  close: 'Close',
  latencySuffix: 'ms',
};

function tileColor(slideIndex: number): string {
  // Deterministic pastel so tiles have a bit of visual variety.
  const hue = (((slideIndex * 47) % 360) + 360) % 360;
  return `hsl(${hue} 70% 45%)`;
}

export function AudienceMirror({
  sessionId,
  pollMs = 4000,
  viewports: viewportOverride,
  latencies: latencyOverride,
  labels,
  dataTestId = 'audience-mirror',
}: AudienceMirrorProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const [viewports, setViewports] = useState<AudienceViewport[]>(viewportOverride ?? []);
  const [latencies, setLatencies] = useState<RegionLatency[]>(latencyOverride ?? []);
  const [fullscreen, setFullscreen] = useState<AudienceViewport | null>(null);

  const refresh = useCallback(async () => {
    if (!viewportOverride) {
      const next = await listAudienceViewports(sessionId);
      setViewports(next);
    } else {
      setViewports(viewportOverride);
    }
    if (!latencyOverride) {
      const nextLat = await listRegionLatencies(sessionId);
      setLatencies(nextLat);
    } else {
      setLatencies(latencyOverride);
    }
  }, [latencyOverride, sessionId, viewportOverride]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  // Index latencies by region so the tile can show the per-region value
  // without an O(N*M) lookup.
  const latencyByRegion = useMemo(() => {
    const map = new Map<string, RegionLatency>();
    for (const r of latencies) map.set(r.region, r);
    return map;
  }, [latencies]);

  const tiles = viewports.slice(0, 4);

  return (
    <section className="audience-mirror" aria-label={t.heading} data-testid={dataTestId}>
      <header className="audience-mirror__header">
        <h3 className="audience-mirror__title">{t.heading}</h3>
        <span className="audience-mirror__count" data-testid={`${dataTestId}-count`}>
          {tiles.length}
        </span>
      </header>
      {tiles.length === 0 ? (
        <p className="audience-mirror__empty" data-testid={`${dataTestId}-empty`}>
          {t.empty}
        </p>
      ) : (
        <div className="audience-mirror__grid">
          {tiles.map((v) => {
            const lat = latencyByRegion.get(v.region);
            return (
              <button
                type="button"
                className="audience-mirror__tile"
                key={v.region}
                aria-label={`${t.fullscreen}: ${v.region}`}
                onClick={() => setFullscreen(v)}
                data-testid={`${dataTestId}-tile`}
                data-region={v.region}
              >
                <span
                  className="audience-mirror__slide"
                  aria-hidden="true"
                  style={{ backgroundColor: tileColor(v.slide_index) }}
                >
                  {v.slide_index}
                </span>
                <span className="audience-mirror__region" data-testid={`${dataTestId}-region`}>
                  {v.region}
                </span>
                <span className="audience-mirror__latency" data-testid={`${dataTestId}-latency`}>
                  {lat ? `${lat.latency_ms}${t.latencySuffix}` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {fullscreen && (
        <div
          className="audience-mirror__fs"
          role="dialog"
          aria-modal="true"
          aria-label={`${fullscreen.region} fullscreen`}
          data-testid={`${dataTestId}-fullscreen`}
          onClick={() => setFullscreen(null)}
        >
          <div className="audience-mirror__fs-card" onClick={(e) => e.stopPropagation()}>
            <header className="audience-mirror__fs-header">
              <strong>{fullscreen.region}</strong>
              <button
                type="button"
                onClick={() => setFullscreen(null)}
                aria-label={t.close}
                data-testid={`${dataTestId}-fullscreen-close`}
              >
                ✕
              </button>
            </header>
            <div
              className="audience-mirror__fs-slide"
              style={{ backgroundColor: tileColor(fullscreen.slide_index) }}
            >
              {fullscreen.slide_index}
            </div>
            <p className="audience-mirror__fs-meta">
              {latencyByRegion.get(fullscreen.region)
                ? `${latencyByRegion.get(fullscreen.region)!.latency_ms}${t.latencySuffix}`
                : '—'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
