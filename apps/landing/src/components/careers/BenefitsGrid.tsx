/**
 * BenefitsGrid — the perks & benefits section of the Careers page.
 *
 * S12.11 — pure presentational server component. Driven by the
 * BENEFITS array in careers-data.ts.
 */

import type { JSX } from 'react';

export interface BenefitsGridProps {
  readonly benefits: ReadonlyArray<{
    readonly title: string;
    readonly description: string;
  }>;
}

export function BenefitsGrid({ benefits }: BenefitsGridProps): JSX.Element {
  return (
    <section className="careers-benefits" aria-labelledby="careers-benefits-heading">
      <h2 id="careers-benefits-heading" className="careers-section-heading">
        Benefits &amp; perks
      </h2>
      <ul className="careers-benefits__grid" data-testid="benefits-grid">
        {benefits.map((b) => (
          <li key={b.title} className="careers-benefits__item">
            <h3 className="careers-benefits__title">{b.title}</h3>
            <p className="careers-benefits__description">{b.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default BenefitsGrid;
