/**
 * TutorialSteps — step-by-step walkthrough with screenshots.
 *
 * Wave 12 §S12.2. Renders an ordered list of steps, each with a
 * title, body copy, and a screenshot placeholder. The screenshot
 * component is keyed by step index so the test ids stay stable.
 *
 * The component is purely presentational — the data layer lives in
 * `feature-catalog.ts`.
 */

import type { JSX } from 'react';
import { Screenshot } from './Screenshot';
import type { FeatureDetail } from '../../lib/feature-catalog';

export interface TutorialStepsProps {
  readonly feature: FeatureDetail;
}

export function TutorialSteps({ feature }: TutorialStepsProps): JSX.Element {
  return (
    <section
      className="fp-steps"
      aria-labelledby="fp-steps-heading"
      data-testid="fp-steps"
      data-slug={feature.slug}
    >
      <header className="fp-steps__header">
        <h2 id="fp-steps-heading" className="fp-steps__heading">
          How to use {feature.title}
        </h2>
        <p className="fp-steps__sub">
          {feature.steps.length} steps · under 5 minutes
        </p>
      </header>
      <ol className="fp-steps__list">
        {feature.steps.map((step, index) => (
          <li
            key={`${feature.slug}-${index}`}
            className="fp-steps__item"
            data-testid="fp-step"
            data-step={index + 1}
          >
            <div className="fp-steps__meta">
              <span className="fp-steps__index" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="fp-steps__title">{step.title}</h3>
            </div>
            <p className="fp-steps__body">{step.description}</p>
            <Screenshot
              alt={step.screenshot_alt}
              step={index + 1}
              slug={feature.slug}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

export default TutorialSteps;
