/**
 * Tutorials — three cards (canvas plugin, data connector, export
 * format) that link into the deeper anchor sections rendered further
 * down the page.
 *
 * The cards render the tutorial's title, description, difficulty,
 * and time estimate. Each card's CTA is a hash link to the matching
 * `<TutorialDetail>` anchor rendered by the page.
 */

import type { ReactElement } from 'react';
import type { PluginTutorial } from '../../lib/plugin-sdk-data';

export interface TutorialsProps {
  heading: string;
  startLabel: string;
  minutesLabel: (n: number) => string;
  tutorials: ReadonlyArray<PluginTutorial>;
}

export function Tutorials({
  heading,
  startLabel,
  minutesLabel,
  tutorials,
}: TutorialsProps): ReactElement {
  return (
    <section className="psdk-section" aria-labelledby="psdk-tutorials-heading">
      <h2 id="psdk-tutorials-heading">{heading}</h2>
      <div className="psdk-tutorial-grid">
        {tutorials.map((tutorial) => (
          <article key={tutorial.slug} className="psdk-tutorial-card">
            <header className="psdk-tutorial-card__header">
              <h3 className="psdk-tutorial-card__title">{tutorial.title}</h3>
              <span
                className={`psdk-tutorial-card__difficulty psdk-tutorial-card__difficulty--${tutorial.difficulty}`}
              >
                {tutorial.difficulty}
              </span>
            </header>
            <p className="psdk-tutorial-card__body">{tutorial.description}</p>
            <footer className="psdk-tutorial-card__footer">
              <span className="psdk-tutorial-card__time">
                {minutesLabel(tutorial.time_estimate_min)}
              </span>
              <a
                className="psdk-tutorial-card__cta"
                href={`#tutorial-${tutorial.slug}`}
                aria-label={`${startLabel}: ${tutorial.title}`}
              >
                {startLabel} →
              </a>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
