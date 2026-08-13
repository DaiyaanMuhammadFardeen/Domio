'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { creatorConsole } from '@domio/ui/routing';
import type { OnboardingState } from '../../lib/onboarding-service';

export interface Step4FirstListingProps {
  readonly state: OnboardingState;
}

const METHOD_LABEL: Record<'bank' | 'stripe' | 'paypal', string> = {
  bank: 'Bank transfer',
  stripe: 'Stripe Connect',
  paypal: 'PayPal',
};

const ID_TYPE_LABEL: Record<'ssn' | 'ein' | 'vat' | 'none', string> = {
  ssn: 'SSN',
  ein: 'EIN',
  vat: 'VAT',
  none: 'None',
};

export function Step4FirstListing({ state }: Step4FirstListingProps) {
  const { t } = useI18n();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5"
      data-testid="onboarding-step4-listing"
    >
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {t('creator.onboarding.listing.heading')}
      </h2>
      <p className="text-sm text-slate-600">{t('creator.onboarding.listing.body')}</p>

      <ul className="space-y-2 rounded-md border border-slate-200 bg-white p-4">
        <SummaryRow
          label={t('creator.onboarding.step.identity')}
          value={
            state.identity.verified
              ? `${state.identity.legal_name ?? '—'} · ${state.identity.country ?? '—'}`
              : '—'
          }
          ok={state.identity.verified}
        />
        <SummaryRow
          label={t('creator.onboarding.step.payout')}
          value={`${METHOD_LABEL[state.payout.method]}${
            state.payout.last4
              ? ` · **** ${state.payout.last4}`
              : state.payout.stripe_id
                ? ` · ${state.payout.stripe_id}`
                : state.payout.paypal_email
                  ? ` · ${state.payout.paypal_email}`
                  : ''
          }`}
          ok={state.completed.includes('payout')}
        />
        <SummaryRow
          label={t('creator.onboarding.step.tax')}
          value={`${state.tax.country || '—'} · ${ID_TYPE_LABEL[state.tax.id_type]}`}
          ok={state.completed.includes('tax')}
        />
      </ul>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={creatorConsole('listings')}
          className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          data-testid="onboarding-listing-skip"
        >
          {t('creator.onboarding.listing.skip')}
        </Link>
        <Link
          href={creatorConsole('listings-create')}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          data-testid="onboarding-listing-cta"
        >
          {t('creator.onboarding.listing.cta')} →
        </Link>
      </div>
    </section>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={
            ok
              ? 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
              : 'flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-400'
          }
          aria-hidden
        >
          {ok ? <Check className="h-3 w-3" /> : '·'}
        </span>
        <span className="font-medium text-slate-700">{label}</span>
      </div>
      <span className="text-right text-slate-500">{value}</span>
    </li>
  );
}
