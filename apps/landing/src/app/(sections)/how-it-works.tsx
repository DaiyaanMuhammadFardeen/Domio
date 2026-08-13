/**
 * How it works — Wave 12 §S12.1.
 *
 * Three-step explainer with an embedded "video" placeholder. We render a
 * styled play card in place of an `<iframe>` so the page stays static
 * and dependency-free; replacing this with a real video embed is
 * tracked as a future enhancement.
 */

import type { JSX } from 'react';

interface HowStep {
  readonly step: number;
  readonly title: string;
  readonly body: string;
}

const STEPS: ReadonlyArray<HowStep> = [
  {
    step: 1,
    title: 'Build with live data',
    body: 'Pull from any data source, wire formulas, branch on scenarios. The editor keeps every slide in sync with your data.',
  },
  {
    step: 2,
    title: 'Present from any device',
    body: 'Open the presenter on your phone or laptop. Audience joins from any browser, no app, no account.',
  },
  {
    step: 3,
    title: 'Ship, share, and analyze',
    body: 'Publish to a private link, embed on any site, or export to PDF/PPTX. Every viewer action lands in your analytics.',
  },
];

export function HowItWorks(): JSX.Element {
  return (
    <section
      className="how-section"
      aria-labelledby="how-heading"
      data-testid="how-it-works"
    >
      <header className="how-section__header">
        <p className="how-section__eyebrow">How it works</p>
        <h2 id="how-heading" className="how-section__title">
          From idea to ship in three steps.
        </h2>
      </header>

      <div className="how-section__video" data-testid="how-video">
        <div className="how-section__video-frame" aria-hidden="true">
          <div className="how-section__video-inner">
            <div className="how-section__video-track">
              {STEPS.map((s) => (
                <div key={s.step} className="how-section__video-slide">
                  <span className="how-section__video-step">Step {s.step}</span>
                  <span className="how-section__video-title">{s.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="how-section__video-play"
          aria-label="Play the 90-second product tour"
          data-testid="how-play"
        >
          ▶
        </button>
        <p className="how-section__video-caption">
          90-second product tour — narrated by the Domio team.
        </p>
      </div>

      <ol className="how-section__steps">
        {STEPS.map((s) => (
          <li key={s.step} className="how-section__step" data-testid="how-step">
            <div className="how-section__step-num">{s.step}</div>
            <div className="how-section__step-body">
              <h3 className="how-section__step-title">{s.title}</h3>
              <p className="how-section__step-copy">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HowItWorks;
