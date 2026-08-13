/**
 * PublishFlow — horizontal diagram of the five-step publish
 * lifecycle (develop → test → submit → review → live). Each step
 * renders an icon placeholder, a title, and a description.
 *
 * Layout is intentionally flow-based: the steps lay out left-to-
 * right on wide viewports and stack vertically on narrow screens
 * via the `.psdk-publish__track` rules.
 */

import type { ReactElement } from 'react';
import type { PublishStep } from '../../lib/plugin-sdk-data';

export interface PublishFlowProps {
  heading: string;
  steps: ReadonlyArray<PublishStep>;
}

const ICON_GLYPHS = ['✎', '✓', '↗', '◎', '★'] as const;

export function PublishFlow({ heading, steps }: PublishFlowProps): ReactElement {
  return (
    <section className="psdk-section" aria-labelledby="psdk-publish-heading">
      <h2 id="psdk-publish-heading">{heading}</h2>
      <ol className="psdk-publish" role="list">
        {steps.map((step, index) => {
          const glyph = ICON_GLYPHS[index] ?? '•';
          return (
            <li key={step.step} className="psdk-publish__step">
              <div className="psdk-publish__icon" aria-hidden="true">
                <span>{glyph}</span>
              </div>
              <div className="psdk-publish__meta">
                <span className="psdk-publish__index">{step.step}</span>
                <h3 className="psdk-publish__title">{step.title}</h3>
              </div>
              <p className="psdk-publish__body">{step.description}</p>
              {index < steps.length - 1 ? (
                <div className="psdk-publish__connector" aria-hidden="true">
                  →
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
