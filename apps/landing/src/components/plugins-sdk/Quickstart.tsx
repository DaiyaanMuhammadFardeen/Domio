/**
 * Quickstart — the five-step walkthrough that scaffolds a plugin in
 * ~5 minutes. Each step renders its title, description, and a
 * copy-friendly code snippet.
 *
 * The component is purely presentational: snippets are passed in via
 * props so the catalogue lives in `lib/plugin-sdk-data.ts` and stays
 * the single source of truth.
 */

import type { ReactElement } from 'react';

export interface QuickstartStep {
  step: number;
  title: string;
  body: string;
  code: string;
  language: 'bash' | 'ts';
}

export interface QuickstartProps {
  heading: string;
  steps: ReadonlyArray<QuickstartStep>;
}

export function Quickstart({ heading, steps }: QuickstartProps): ReactElement {
  return (
    <section className="psdk-section" aria-labelledby="psdk-quickstart-heading">
      <h2 id="psdk-quickstart-heading">{heading}</h2>
      <ol className="psdk-quickstart">
        {steps.map((step) => (
          <li key={step.step} className="psdk-quickstart__step">
            <div className="psdk-quickstart__meta">
              <span className="psdk-quickstart__index">{step.step}</span>
              <h3 className="psdk-quickstart__title">{step.title}</h3>
            </div>
            <p className="psdk-quickstart__body">{step.body}</p>
            <pre className="psdk-codeblock" data-language={step.language}>
              <code>{step.code}</code>
            </pre>
            <button
              type="button"
              className="psdk-copy"
              aria-label={`Copy step ${step.step} snippet`}
              data-copy={step.code}
            >
              Copy
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}