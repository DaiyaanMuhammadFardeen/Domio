/**
 * RelatedFeatures — cross-link to other feature deep-dive pages.
 *
 * Wave 12 §S12.2. Each card links to `/features/<slug>` for the
 * related feature. Slugs come from `feature-catalog.ts` so the
 * navigation rail stays consistent with the catalogue.
 */

import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { getFeature, type FeatureDetail } from '../../lib/feature-catalog';

export interface RelatedFeaturesProps {
  readonly current: FeatureDetail;
}

export function RelatedFeatures({ current }: RelatedFeaturesProps): JSX.Element {
  const related = current.related_slugs
    .map((slug) => getFeature(slug))
    .filter((feature): feature is FeatureDetail => feature !== null);

  if (related.length === 0) {
    return (
      <section
        className="fp-related"
        aria-labelledby="fp-related-heading"
        data-testid="fp-related"
        data-slug={current.slug}
      >
        <h2 id="fp-related-heading" className="fp-related__heading">
          Related features
        </h2>
        <p className="fp-related__empty">No related features yet.</p>
      </section>
    );
  }

  return (
    <section
      className="fp-related"
      aria-labelledby="fp-related-heading"
      data-testid="fp-related"
      data-slug={current.slug}
    >
      <h2 id="fp-related-heading" className="fp-related__heading">
        Related features
      </h2>
      <ul className="fp-related__list">
        {related.map((feature) => (
          <li
            key={feature.slug}
            className="fp-related__item"
            data-testid="fp-related-item"
            data-slug={feature.slug}
          >
            <a
              className="fp-related__link"
              href={landing('feature', { slug: feature.slug })}
              aria-label={`Read about ${feature.title}`}
            >
              <span className="fp-related__title">{feature.title}</span>
              <span className="fp-related__tagline">{feature.tagline}</span>
              <span className="fp-related__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RelatedFeatures;