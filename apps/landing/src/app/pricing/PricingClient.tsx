/**
 * PricingClient — client wrapper for the pricing page.
 *
 * Wave 12 S12.3. Owns the monthly/yearly toggle state. The data
 * layer (tier definitions) stays on the server page so copywriters
 * can edit tiers without touching client code.
 *
 * S12.1 may eventually expose a reusable `PricingTable` component;
 * while that lands, this file defines the table locally.
 */

'use client';

import { useState, type JSX } from 'react';

export interface PricingTier {
  readonly id: 'free' | 'pro' | 'enterprise';
  readonly name: string;
  readonly tagline: string;
  readonly monthly: number | 'custom';
  readonly yearly: number | 'custom';
  readonly features: ReadonlyArray<string>;
  readonly cta: string;
  readonly highlighted: boolean;
}

export interface PricingClientProps {
  readonly tiers: ReadonlyArray<PricingTier>;
  readonly signupHref: string;
}

type BillingCycle = 'monthly' | 'yearly';

function formatPrice(value: number | 'custom'): string {
  if (value === 'custom') return 'Custom';
  if (value === 0) return 'Free';
  return `$${value}`;
}

function cycleSuffix(cycle: BillingCycle): string {
  return cycle === 'monthly' ? '/mo' : '/mo, billed yearly';
}

export function PricingClient({ tiers, signupHref }: PricingClientProps): JSX.Element {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <section
      className="pricing-table"
      aria-labelledby="pricing-table-heading"
      data-testid="pricing-table"
    >
      <div className="pricing-table__header">
        <h2 id="pricing-table-heading" className="pricing-table__heading">
          Plans
        </h2>
        <div className="pricing-table__toggle" role="group" aria-label="Billing cycle">
          <button
            type="button"
            className={
              'pricing-table__toggle-btn' +
              (cycle === 'monthly' ? ' pricing-table__toggle-btn--active' : '')
            }
            aria-pressed={cycle === 'monthly'}
            data-testid="pricing-cycle-monthly"
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={
              'pricing-table__toggle-btn' +
              (cycle === 'yearly' ? ' pricing-table__toggle-btn--active' : '')
            }
            aria-pressed={cycle === 'yearly'}
            data-testid="pricing-cycle-yearly"
            onClick={() => setCycle('yearly')}
          >
            Yearly <span className="pricing-table__badge">−2 months</span>
          </button>
        </div>
      </div>

      <div className="pricing-table__grid">
        {tiers.map((tier) => {
          const price = cycle === 'monthly' ? tier.monthly : tier.yearly;
          const ctaHref = tier.id === 'enterprise' ? signupHref : signupHref;
          return (
            <article
              key={tier.id}
              className={'pricing-card' + (tier.highlighted ? ' pricing-card--highlighted' : '')}
              data-testid={`pricing-card-${tier.id}`}
            >
              <header className="pricing-card__header">
                <h3 className="pricing-card__name">{tier.name}</h3>
                <p className="pricing-card__tagline">{tier.tagline}</p>
              </header>
              <p className="pricing-card__price" data-testid={`pricing-price-${tier.id}`}>
                <span className="pricing-card__price-amount">{formatPrice(price)}</span>
                {price !== 'custom' && price > 0 ? (
                  <span className="pricing-card__price-suffix">{cycleSuffix(cycle)}</span>
                ) : null}
              </p>
              <ul className="pricing-card__features">
                {tier.features.map((feature) => (
                  <li key={feature} className="pricing-card__feature">
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                className={
                  'pricing-card__cta' + (tier.highlighted ? ' pricing-card__cta--primary' : '')
                }
                href={ctaHref}
              >
                {tier.cta} →
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default PricingClient;
