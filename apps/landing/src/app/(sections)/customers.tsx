/**
 * Customers / logo strip — Wave 12 §S12.1.
 */

import type { JSX } from 'react';
import CustomerLogoStrip from '../../components/CustomerLogoStrip';
import { CUSTOMER_LOGOS } from '../../lib/marketing-data';

export function Customers(): JSX.Element {
  return (
    <section
      className="customers-section"
      aria-labelledby="customers-heading"
      data-testid="customers-section"
    >
      <header className="customers-section__header">
        <p className="customers-section__eyebrow">Trusted by teams</p>
        <h2 id="customers-heading" className="customers-section__title">
          From Fortune 500 to one-person teams.
        </h2>
      </header>
      <CustomerLogoStrip logos={CUSTOMER_LOGOS} />
    </section>
  );
}

export default Customers;
