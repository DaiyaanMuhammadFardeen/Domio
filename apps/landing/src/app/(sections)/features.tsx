/**
 * Features section — Wave 12 §S12.1.
 *
 * Renders the 24-card FeatureGrid under a single heading. The grid is
 * grouped by category, with three cards each.
 */

import type { JSX } from 'react';
import FeatureGrid from '../../components/FeatureGrid';

export function Features(): JSX.Element {
  return (
    <section
      className="features-section"
      aria-labelledby="features-heading"
      data-testid="features-section"
    >
      <header className="features-section__header">
        <p className="features-section__eyebrow">What you can do</p>
        <h2 id="features-heading" className="features-section__title">
          24 capabilities. One workspace.
        </h2>
        <p className="features-section__lede">
          Editor, viewer, presenter, audience, analytics, marketplace,
          enterprise, and agentic — everything in the same workspace.
        </p>
      </header>
      <FeatureGrid />
    </section>
  );
}

export default Features;