/**
 * Feature hero — title, tagline, hero description, illustration.
 *
 * Wave 12 §S12.2. Renders the eyebrow (category label), the feature
 * title, the tagline, the long hero description, and a CSS-drawn
 * illustration that hints at the feature. The illustration is a
 * placeholder; once the design team ships real artwork we swap it
 * in via the `illustration` slot.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import type { FeatureDetail } from '../../lib/feature-catalog';

const CATEGORY_LABEL: Readonly<Record<FeatureDetail['category'], string>> = {
  editor: 'Editor',
  viewer: 'Viewer',
  presenter: 'Presenter',
  audience: 'Audience',
  analytics: 'Analytics',
  marketplace: 'Marketplace',
  enterprise: 'Enterprise',
  agentic: 'Agentic',
};

export interface HeroProps {
  readonly feature: FeatureDetail;
}

function IllustrationPlaceholder({ icon, slug }: { readonly icon: string; readonly slug: string }): JSX.Element {
  // Decorative placeholder — the real artwork is delivered by the
  // design team. The glyph uses the first two letters of the icon
  // id, mirroring the FeatureGrid pattern.
  const glyph = icon.slice(0, 2).toUpperCase();
  return (
    <div
      className="fp-hero__illustration"
      aria-hidden="true"
      data-testid="fp-hero-illustration"
      data-slug={slug}
    >
      <span className="fp-hero__glyph">{glyph}</span>
    </div>
  );
}

function tryHrefFor(slug: string): string {
  return `${landing('signup')}?feature=${encodeURIComponent(slug)}`;
}

export function Hero({ feature }: HeroProps): JSX.Element {
  const eyebrow = CATEGORY_LABEL[feature.category];
  const tryHref = tryHrefFor(feature.slug);
  return (
    <section className="fp-hero" aria-labelledby="fp-hero-heading" data-testid="fp-hero">
      <div className="fp-hero__inner">
        <p className="fp-hero__eyebrow" data-testid="fp-hero-eyebrow">{eyebrow}</p>
        <h1 id="fp-hero-heading" className="fp-hero__title" data-testid="fp-hero-title">
          {feature.title}
        </h1>
        <p className="fp-hero__subtitle" data-testid="fp-hero-tagline">{feature.tagline}</p>
        <p className="fp-hero__description" data-testid="fp-hero-description">
          {feature.hero_description}
        </p>
        <div className="fp-hero__actions">
          <a
            className="fp-hero__cta fp-hero__cta--primary"
            href={tryHref}
            data-testid="fp-hero-try"
            aria-label={`Try ${feature.title} now`}
          >
            Try it now →
          </a>
          <a
            className="fp-hero__cta fp-hero__cta--secondary"
            href={landing('features')}
            data-testid="fp-hero-back"
          >
            ← All features
          </a>
        </div>
      </div>
      <IllustrationPlaceholder icon={feature.icon} slug={feature.slug} />
    </section>
  );
}

export default Hero;
