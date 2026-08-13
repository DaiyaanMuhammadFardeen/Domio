/**
 * ExamplesGallery — 3-5 copy-able worked invocations.
 *
 * S10.4 — each example pairs a short prose description with the exact
 * command the user can paste into their terminal. The Copy button is
 * client-side so it can hit the Clipboard API.
 */

'use client';

import { useState, useEffect, type JSX } from 'react';
import type { CliExample } from '../../lib/cli-data';

export interface ExamplesGalleryProps {
  readonly examples: ReadonlyArray<CliExample>;
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onClick = async (): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="cli-copy-btn"
      onClick={onClick}
      aria-label={copied ? 'Copied' : 'Copy command'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function ExamplesGallery({ examples }: ExamplesGalleryProps): JSX.Element {
  return (
    <section className="cli-examples" aria-labelledby="cli-examples-heading">
      <h2 id="cli-examples-heading" className="cli-section-heading">
        Examples
      </h2>
      <ul className="cli-example-list">
        {examples.map((ex) => (
          <li key={ex.title} className="cli-example-card">
            <h3 className="cli-example-card__title">{ex.title}</h3>
            <p className="cli-example-card__description">{ex.description}</p>
            <div className="cli-example-card__body">
              <pre className="cli-snippet">
                <code>{ex.command}</code>
              </pre>
              <CopyButton value={ex.command} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ExamplesGallery;
