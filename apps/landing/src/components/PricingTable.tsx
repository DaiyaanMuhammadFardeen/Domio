/**
 * PricingTable — three-tier comparison with monthly/yearly toggle.
 *
 * Wave 12 §S12.1. The toggle uses a controlled `mode` state so we can
 * swap between monthly and yearly prices. The Enterprise tier renders
 * "Custom" when prices are null.
 *
 * We deliberately render the call-to-action as a plain `<a>` so this
 * stays an interactive but lightweight client component (no router
 * dependency).
 */

'use client';

import { useState, type JSX } from 'react';
import type { PricingTier } from '../lib/marketing-data';

interface PricingTableProps {
  readonly tiers: ReadonlyArray<PricingTier>;
}

type BillingMode = 'monthly' | 'yearly';

function formatPrice(tier: PricingTier, mode: BillingMode): string {
  const value = mode === 'monthly' ? tier.price_monthly_usd : tier.price_yearly_usd;
  if (value === null || value === undefined) return 'Custom';
  if (value === 0) return '$0';
  const prefix = mode === 'yearly' ? '$' : '$';
  const suffix = mode === 'monthly' ? '/mo' : '/yr';
  return `${prefix}${value.toLocaleString()}${suffix}`;
}

export function PricingTable({ tiers }: PricingTableProps): JSX.Element {
  const [mode, setMode] = useState<BillingMode>('monthly');

  return (
    <div className="pricing-table" data-testid="pricing-table" data-billing={mode}>
      <div className="pricing-table__toggle" role="tablist" aria-label="Billing period">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'monthly'}
          className={
            'pricing-table__toggle-btn' +
            (mode === 'monthly' ? ' pricing-table__toggle-btn--active' : '')
          }
          onClick={() => setMode('monthly')}
          data-testid="pricing-toggle-monthly"
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'yearly'}
          className={
            'pricing-table__toggle-btn' +
            (mode === 'yearly' ? ' pricing-table__toggle-btn--active' : '')
          }
          onClick={() => setMode('yearly')}
          data-testid="pricing-toggle-yearly"
        >
          Yearly <span className="pricing-table__save">save 16%</span>
        </button>
      </div>

      <ul className="pricing-table__list">
        {tiers.map((tier) => {
          const isCustom = tier.price_monthly_usd === null;
          return (
            <li
              key={tier.id}
              className={
                'pricing-table__item' +
                (tier.highlighted ? ' pricing-table__item--highlighted' : '')
              }
              data-testid={`pricing-tier-${tier.id}`}
              data-highlighted={tier.highlighted ? 'true' : 'false'}
            >
              <article className="pricing-card" aria-labelledby={`pricing-${tier.id}`}>
                {tier.highlighted ? (
                  <span className="pricing-card__ribbon">Most popular</span>
                ) : null}
                <h3 id={`pricing-${tier.id}`} className="pricing-card__name">
                  {tier.name}
                </h3>
                <p className="pricing-card__price">
                  <span className="pricing-card__amount">{formatPrice(tier, mode)}</span>
                  {!isCustom && tier.price_monthly_usd !== 0 ? (
                    <span className="pricing-card__unit">
                      {mode === 'monthly' ? 'per workspace / month' : 'per workspace / year'}
                    </span>
                  ) : null}
                </p>
                <p className="pricing-card__tagline">{tier.tagline}</p>
                <a
                  className={
                    'pricing-card__cta' +
                    (tier.highlighted
                      ? ' pricing-card__cta--primary'
                      : ' pricing-card__cta--secondary')
                  }
                  href={tier.cta_href}
                >
                  {tier.cta_label}
                </a>
                <ul className="pricing-card__features">
                  {tier.features.map((f, i) => (
                    <li key={i} className="pricing-card__feature">
                      <span className="pricing-card__check" aria-hidden="true">
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PricingTable;
