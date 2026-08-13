/**
 * GifDemo — 30-second animated demo placeholder.
 *
 * Wave 12 §S12.2. The real asset is a GIF produced by the design
 * pipeline and uploaded to the marketing CDN. Until the GIF lands,
 * we render a CSS-animated placeholder that loops on a 30s timer
 * to mirror the intended length.
 *
 * The component is intentionally lightweight — a single div with
 * keyframe animation, no client-side state, no JS. Server-renderable.
 */

import type { JSX } from 'react';

export interface GifDemoProps {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

const FRAME_COUNT = 4;

function FramePlaceholder({ index }: { readonly index: number }): JSX.Element {
  return (
    <div
      className="fp-gif__frame"
      data-testid="fp-gif-frame"
      data-frame={index + 1}
      aria-hidden="true"
    >
      <span className="fp-gif__frame-index">{index + 1}</span>
    </div>
  );
}

export function GifDemo({ slug, title, description }: GifDemoProps): JSX.Element {
  return (
    <section
      className="fp-gif"
      aria-labelledby="fp-gif-heading"
      data-testid="fp-gif"
      data-slug={slug}
    >
      <header className="fp-gif__header">
        <h2 id="fp-gif-heading" className="fp-gif__heading">
          30-second demo
        </h2>
        <p className="fp-gif__sub">{description}</p>
      </header>
      <div
        className="fp-gif__stage"
        role="img"
        aria-label={`Animated demo of ${title}. Loops every 30 seconds.`}
      >
        {Array.from({ length: FRAME_COUNT }, (_, i) => (
          <FramePlaceholder key={i} index={i} />
        ))}
      </div>
      <p className="fp-gif__caption" aria-hidden="true">
        {title} — placeholder demo loop · 30s
      </p>
    </section>
  );
}

export default GifDemo;
