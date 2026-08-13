/**
 * Pricing page — `/pricing`.
 *
 * Wave 12 S12.3. Server component that renders the marketing copy
 * around the pricing tiers. The interactive monthly/yearly toggle is
 * delegated to the client wrapper `PricingClient`, which uses the
 * shared `PricingTable` component defined locally for this wave.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import PricingClient from './PricingClient';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Pricing — Domio',
  description:
    'Pick the plan that fits your team. Free for individuals, Pro for growing teams, Enterprise for organisations with security, residency, and support needs.',
};

interface PricingTier {
  readonly id: 'free' | 'pro' | 'enterprise';
  readonly name: string;
  readonly tagline: string;
  readonly monthly: number | 'custom';
  readonly yearly: number | 'custom';
  readonly features: ReadonlyArray<string>;
  readonly cta: string;
  readonly highlighted: boolean;
}

const TIERS: ReadonlyArray<PricingTier> = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For curious builders kicking the tyres.',
    monthly: 0,
    yearly: 0,
    features: ['3 decks', '1 seat', 'Live presenter analytics (last 7 days)', 'Community support'],
    cta: 'Start free',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For teams shipping decks every week.',
    monthly: 24,
    yearly: 19,
    features: [
      'Unlimited decks',
      '10 seats included',
      'Live presenter analytics (full history)',
      'Custom branding',
      'Priority email support',
    ],
    cta: 'Start Pro trial',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For organisations with security & residency needs.',
    monthly: 'custom',
    yearly: 'custom',
    features: [
      'SSO / SCIM',
      'Data residency (US, EU, APAC)',
      'Audit log + DLP',
      'Dedicated CSM',
      '99.95% SLA',
    ],
    cta: 'Talk to sales',
    highlighted: false,
  },
];

const FAQ: ReadonlyArray<{ readonly question: string; readonly answer: string }> = [
  {
    question: 'Can I switch plans later?',
    answer:
      'Yes. Upgrade or downgrade any time — billing prorates automatically and seat changes take effect immediately.',
  },
  {
    question: 'Do you offer a free trial of Pro?',
    answer: 'Yes. Every workspace gets a 14-day Pro trial with no credit card required.',
  },
  {
    question: 'How does annual billing work?',
    answer:
      'Annual plans are billed up-front and discounted two months versus monthly. Invoices and tax receipts live in the dashboard.',
  },
  {
    question: 'Is there a discount for non-profits or education?',
    answer:
      'Yes — verified non-profits, schools, and student organisations get 50% off Pro. Contact sales for Enterprise pricing.',
  },
];

export default function PricingPage(): JSX.Element {
  const signupHref = landing('signup');

  return (
    <PageShell currentId="pricing" relatedTitle="Get started">
      <main className="pricing-page" data-testid="pricing-page">
        <header className="pricing-page__header">
          <p className="pricing-page__eyebrow">Pricing</p>
          <h1 className="pricing-page__title">Simple plans. Powerful decks.</h1>
          <p className="pricing-page__subtitle">
            Start free. Upgrade when your team is ready. Cancel any time.
          </p>
        </header>

        <PricingClient tiers={TIERS} signupHref={signupHref} />

        <section className="pricing-page__faq" aria-labelledby="pricing-faq-heading">
          <h2 id="pricing-faq-heading" className="pricing-page__faq-heading">
            Frequently asked questions
          </h2>
          <dl className="pricing-page__faq-list">
            {FAQ.map((entry) => (
              <div key={entry.question} className="pricing-page__faq-row">
                <dt className="pricing-page__faq-q">{entry.question}</dt>
                <dd className="pricing-page__faq-a">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </PageShell>
  );
}
