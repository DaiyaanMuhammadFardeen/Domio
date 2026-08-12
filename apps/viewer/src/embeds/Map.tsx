/**
 * Map — viewer-side renderer for `map`-typed slide elements.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Bootstrap implementation: emits a deterministic map preview as an
 * inline SVG so the slide communicates geographic intent without a
 * real tile provider. The real implementation will use the
 * `geo-tiles` service to serve vector tiles, but the public API is
 * fixed.
 */

'use client';

import { useMemo, type ReactElement } from 'react';
import type { MapLayer } from '@domio/schema/generated/scene-graph';

export interface MapProps {
  readonly layer: MapLayer;
  readonly dataTestId?: string;
}

export function Map({ layer, dataTestId = 'map-block' }: MapProps): ReactElement {
  const { center, zoom, styleId, choropleth } = layer;
  const centerLng = center?.lng ?? 0;
  const centerLat = center?.lat ?? 0;
  const safeZoom = Math.max(1, Math.min(20, zoom ?? 4));

  // Convert lng/lat to a normalised 0..1 space using a sinusoidal
  // projection so the placeholder doesn't look weird near the poles.
  const x = (centerLng + 180) / 360;
  const latRad = (centerLat * Math.PI) / 180;
  const y = 0.5 - (Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / (2 * Math.PI));

  const grid = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let i = -3; i <= 3; i++) {
      out.push({ x: 0.5, y: 0.5 + i * 0.1 });
      out.push({ x: 0.5 + i * 0.1, y: 0.5 });
    }
    return out;
  }, []);

  return (
    <div
      data-testid={dataTestId}
      style={{ position: 'absolute', inset: 0, background: '#0f172a' }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%' }}
        role="img"
        aria-label={`Map · ${styleId}`}
      >
        <defs>
          <pattern id="map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#map-grid)" />
        {grid.map((g, i) => (
          <line
            key={i}
            x1={0}
            y1={g.y * 100}
            x2={100}
            y2={g.y * 100}
            stroke="rgba(148,163,184,0.08)"
            strokeWidth="0.2"
          />
        ))}
        <circle cx={x * 100} cy={y * 100} r={Math.max(1, 6 - safeZoom * 0.3)} fill="#38bdf8" stroke="#0ea5e9" strokeWidth="0.5" />
        {choropleth ? (
          <rect x="40" y="40" width="20" height="20" fill="rgba(56,189,248,0.3)" stroke="#38bdf8" strokeWidth="0.3" />
        ) : null}
      </svg>
      <div
        data-testid={`${dataTestId}-badge`}
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          color: 'rgba(226,232,240,0.7)',
          fontSize: 10,
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 6px',
          borderRadius: 3,
        }}
      >
        {styleId} · z{safeZoom} · {centerLat.toFixed(2)},{centerLng.toFixed(2)}
      </div>
    </div>
  );
}