/**
 * Pricing section — Wave 12 §S12.1.
 *
 * Renders the three-tier pricing table under a single heading. The
 * table is interactive (monthly/yearly toggle) so it ships as a client
 * component.
 */

import type { JSX } from 'react';
import PricingTable from '../../components/PricingTable';
import { PRICING_TIERS } from '../../lib/marketing-data';

export function Pricing(): JSX.Element {
  return (
    <section
      className="pricing-section"
      aria-labelledby="pricing-heading"
      data-testid="pricing-section"
    >
      <header className="pricing-section__header">
        <p className="pricing-section__eyebrow">Pricing</p>
        <h2 id="pricing-heading" className="pricing-section__title">
          Simple, per-workspace pricing.
        </h2>
        <p className="pricing-section__lede">No seats. No per-viewer fees. No upsell pressure.</p>
      </header>
      <PricingTable tiers={PRICING_TIERS} />
    </section>
  );
}

export default Pricing;
