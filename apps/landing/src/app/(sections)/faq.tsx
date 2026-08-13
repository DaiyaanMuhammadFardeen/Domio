/**
 * FAQ section — Wave 12 §S12.1.
 *
 * Renders the accordion of 20+ FAQ items.
 */

import type { JSX } from 'react';
import FaqAccordion from '../../components/FaqAccordion';
import { FAQS } from '../../lib/marketing-data';

export function Faq(): JSX.Element {
  return (
    <section
      className="faq-section"
      aria-labelledby="faq-heading"
      data-testid="faq-section"
    >
      <header className="faq-section__header">
        <p className="faq-section__eyebrow">FAQ</p>
        <h2 id="faq-heading" className="faq-section__title">
          Answers to the questions we hear most.
        </h2>
        <p className="faq-section__lede">
          Don&rsquo;t see what you&rsquo;re looking for?{' '}
          <a href="/contact">Drop us a line</a>.
        </p>
      </header>
      <FaqAccordion items={FAQS} />
    </section>
  );
}

export default Faq;
