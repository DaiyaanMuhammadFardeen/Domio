/**
 * FeatureGrid — 24 feature cards grouped by category.
 *
 * Wave 12 §S12.1. The grid renders one section per category with three
 * cards each. Cards are decorative — the title is the prominent label,
 * the description is muted, and a small monogram glyph stands in for a
 * lucide-style icon (we don't ship lucide in the landing bundle).
 */

import type { JSX } from 'react';
import {
  FEATURES,
  FEATURE_CATEGORIES,
  type FeatureCard,
} from '../lib/marketing-data';

interface FeatureGridProps {
  readonly features?: ReadonlyArray<FeatureCard>;
}

function FeatureCardView({ feature }: { readonly feature: FeatureCard }): JSX.Element {
  return (
    <article
      className="feature-card"
      data-testid="feature-card"
      data-category={feature.category}
      data-slug={feature.slug}
    >
      <div className="feature-card__glyph" aria-hidden="true">
        {feature.icon.slice(0, 2).toUpperCase()}
      </div>
      <h3 className="feature-card__title">{feature.title}</h3>
      <p className="feature-card__description">{feature.description}</p>
    </article>
  );
}

export function FeatureGrid({ features = FEATURES }: FeatureGridProps): JSX.Element {
  return (
    <div className="feature-grid" data-testid="feature-grid">
      {FEATURE_CATEGORIES.map((cat) => {
        const items = features.filter((f) => f.category === cat.id);
        return (
          <section
            key={cat.id}
            className="feature-grid__section"
            aria-labelledby={`feature-cat-${cat.id}`}
            data-testid={`feature-section-${cat.id}`}
          >
            <header className="feature-grid__header">
              <h2 id={`feature-cat-${cat.id}`} className="feature-grid__heading">
                {cat.label}
              </h2>
              <p className="feature-grid__tagline">{cat.tagline}</p>
            </header>
            <ul className="feature-grid__list">
              {items.map((f) => (
                <li key={f.slug} className="feature-grid__item">
                  <FeatureCardView feature={f} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default FeatureGrid;
