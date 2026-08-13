/**
 * ResidencyMap — visual data residency map.
 *
 * Wave 12 S12.7. Renders a stylised world map (inline SVG, no external
 * library) with pins for each residency region from `lib/trust-data`.
 * Each pin is a labelled circle; the accompanying region list below the
 * map expands the pin into the full country list and which product
 * surfaces default to that region.
 *
 * The SVG is intentionally a simplified outline (four continents as
 * rounded blobs) so it stays small, ships without a network request, and
 * works in any colour scheme. A future Wave can swap in a real geojson
 * overlay when design wants higher fidelity.
 */

import type { JSX } from 'react';
import type { ResidencyRegion } from '../../lib/trust-data';

export interface ResidencyMapProps {
  readonly regions: ReadonlyArray<ResidencyRegion>;
}

/**
 * Visual pin coordinates inside the 1000×500 viewBox. Tuned so each pin
 * sits roughly above its geographic region. Coordinates are hand-placed
 * to match the simplified continent outline below.
 */
const PIN_COORDS: Record<string, { readonly x: number; readonly y: number }> = {
  'us-east': { x: 260, y: 200 },
  'us-west': { x: 190, y: 210 },
  'ca-central': { x: 260, y: 160 },
  'eu-central': { x: 510, y: 180 },
  'ap-southeast': { x: 760, y: 290 },
  'ap-northeast': { x: 830, y: 200 },
};

export function ResidencyMap({ regions }: ResidencyMapProps): JSX.Element {
  return (
    <section className="trust-residency" aria-labelledby="trust-residency-heading">
      <h2 id="trust-residency-heading" className="trust-section-heading">
        Data residency
      </h2>
      <p className="trust-residency__lede">
        Pin your workspace to a region. Customer content, metadata, and
        backups stay inside that region&rsquo;s data path unless you
        explicitly opt in to cross-region replication.
      </p>

      <div
        className="trust-residency__map"
        data-testid="trust-residency-map"
        role="img"
        aria-label="World map showing Domio data residency regions"
      >
        <svg
          viewBox="0 0 1000 500"
          xmlns="http://www.w3.org/2000/svg"
          className="trust-residency__svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="trust-pin-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Simplified continent outlines. Not geographically accurate —
              just enough to anchor the pins. */}
          <g className="trust-residency__continents" fill="var(--panel)" stroke="var(--border)">
            <path d="M 130 130 Q 200 100 320 130 Q 340 200 300 280 Q 250 320 180 290 Q 110 240 130 130 Z" />
            <path d="M 460 110 Q 560 90 600 160 Q 605 230 560 260 Q 490 270 460 220 Q 440 160 460 110 Z" />
            <path d="M 600 160 Q 680 170 720 220 Q 730 280 680 320 Q 620 340 600 290 Q 580 220 600 160 Z" />
            <path d="M 720 250 Q 800 240 870 270 Q 900 320 850 360 Q 770 380 730 340 Q 700 290 720 250 Z" />
            <path d="M 800 340 Q 880 340 920 380 Q 900 420 830 420 Q 790 400 800 340 Z" />
          </g>

          {regions.map((region) => {
            const coords = PIN_COORDS[region.code] ?? { x: 500, y: 250 };
            return (
              <g
                key={region.code}
                className="trust-residency__pin"
                data-testid="trust-residency-region"
                data-region-code={region.code}
              >
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r="18"
                  fill="url(#trust-pin-glow)"
                />
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r="6"
                  className="trust-residency__pin-dot"
                />
                <text
                  x={coords.x}
                  y={coords.y - 14}
                  textAnchor="middle"
                  className="trust-residency__pin-label"
                >
                  {region.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="trust-residency__list">
        {regions.map((region) => (
          <li
            key={region.code}
            className="trust-residency__item"
            data-testid="trust-residency-item"
            data-region-code={region.code}
          >
            <div className="trust-residency__item-head">
              <span className="trust-residency__code">{region.code}</span>
              <h3 className="trust-residency__label">{region.label}</h3>
            </div>
            <p className="trust-residency__countries">
              <span className="trust-residency__meta-label">Countries: </span>
              {region.countries.join(', ')}
            </p>
            <p className="trust-residency__defaults">
              <span className="trust-residency__meta-label">Default for: </span>
              {region.default_for.join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ResidencyMap;
