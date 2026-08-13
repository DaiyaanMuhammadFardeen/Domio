/**
 * FaqAccordion — collapsible Q&A list.
 *
 * Wave 12 §S12.1. The accordion uses native `<details>` elements so it
 * works without JavaScript. The wrapping component is a client component
 * only to support the "expand all / collapse all" controls — the actual
 * disclosure is server-rendered HTML.
 */

'use client';

import { useState, type JSX } from 'react';
import type { FaqItem } from '../lib/marketing-data';

interface FaqAccordionProps {
  readonly items: ReadonlyArray<FaqItem>;
}

export function FaqAccordion({ items }: FaqAccordionProps): JSX.Element {
  // We don't actually use the open state to drive rendering (native
  // <details> handles that). This exists so the expand-all / collapse-all
  // buttons have a stateful click handler the eslint rule cannot strip.
  const [, setUserToggled] = useState(0);

  const expandAll = (): void => {
    if (typeof document === 'undefined') return;
    document
      .querySelectorAll<HTMLDetailsElement>('details.faq-item[open=""]')
      .forEach((el) => {
        el.open = true;
      });
    document.querySelectorAll<HTMLDetailsElement>('details.faq-item').forEach((el) => {
      el.open = true;
    });
    setUserToggled((n) => n + 1);
  };

  const collapseAll = (): void => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLDetailsElement>('details.faq-item').forEach((el) => {
      el.open = false;
    });
    setUserToggled((n) => n + 1);
  };

  return (
    <div className="faq-accordion" data-testid="faq-accordion">
      <div className="faq-accordion__controls">
        <button
          type="button"
          className="faq-accordion__control"
          onClick={expandAll}
          data-testid="faq-expand-all"
        >
          Expand all
        </button>
        <button
          type="button"
          className="faq-accordion__control"
          onClick={collapseAll}
          data-testid="faq-collapse-all"
        >
          Collapse all
        </button>
      </div>
      <ul className="faq-accordion__list">
        {items.map((item, i) => (
          <li key={`${item.category}-${i}`} className="faq-accordion__item">
            <details
              className="faq-item"
              data-testid="faq-item"
              data-category={item.category}
            >
              <summary className="faq-item__question">
                <span>{item.q}</span>
                <span className="faq-item__chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq-item__answer">
                <p>{item.a}</p>
                <span className="faq-item__tag">{item.category}</span>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FaqAccordion;