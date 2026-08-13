/**
 * Screenshot — placeholder image for a tutorial step.
 *
 * Wave 12 §S12.2. The real product screenshots are produced by the
 * docs pipeline and uploaded to the marketing CDN; until they land,
 * this component renders an SVG placeholder with the step number
 * and the alt text as visible label.
 *
 * Marked decorative with `role="img"` and `aria-label` so screen
 * readers read the alt without the SVG structure leaking.
 */

import type { JSX } from 'react';

export interface ScreenshotProps {
  readonly alt: string;
  readonly step: number;
  readonly slug: string;
}

export function Screenshot({ alt, step, slug }: ScreenshotProps): JSX.Element {
  const label = `Step ${step}`;
  return (
    <figure
      className="fp-screenshot"
      data-testid="fp-screenshot"
      data-step={step}
      data-slug={slug}
    >
      <div
        className="fp-screenshot__frame"
        role="img"
        aria-label={alt}
      >
        <div className="fp-screenshot__chrome" aria-hidden="true">
          <span className="fp-screenshot__dot" />
          <span className="fp-screenshot__dot" />
          <span className="fp-screenshot__dot" />
        </div>
        <div className="fp-screenshot__body" aria-hidden="true">
          <span className="fp-screenshot__step">{label}</span>
          <span className="fp-screenshot__alt">{alt}</span>
        </div>
      </div>
      <figcaption className="fp-screenshot__caption">{alt}</figcaption>
    </figure>
  );
}

export default Screenshot;
