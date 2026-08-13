'use client';

import { useId, useState } from 'react';
import { clsx } from 'clsx';
import { useI18n } from '../../lib/i18n';
import type { PayoutMethod, PayoutPayload } from '../../lib/onboarding-service';

export interface Step2PayoutProps {
  readonly defaultValues?: Partial<PayoutPayload>;
  readonly onSubmit: (payload: PayoutPayload) => Promise<void>;
}

const METHODS: ReadonlyArray<{ value: PayoutMethod; labelKey: string }> = [
  { value: 'bank', labelKey: 'creator.onboarding.payout.bankTransfer' },
  { value: 'stripe', labelKey: 'creator.onboarding.payout.stripeConnect' },
  { value: 'paypal', labelKey: 'creator.onboarding.payout.paypal' },
];

export function Step2Payout({ defaultValues, onSubmit }: Step2PayoutProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [method, setMethod] = useState<PayoutMethod>(defaultValues?.method ?? 'stripe');
  const [last4, setLast4] = useState<string>(defaultValues?.last4 ?? '');
  const [stripeId, setStripeId] = useState<string>(defaultValues?.stripe_id ?? '');
  const [paypalEmail, setPaypalEmail] = useState<string>(
    defaultValues?.paypal_email ?? '',
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeConnecting, setStripeConnecting] = useState<boolean>(false);
  const [stripeConnected, setStripeConnected] = useState<boolean>(
    Boolean(defaultValues?.stripe_id),
  );

  function isValid(): boolean {
    if (method === 'bank') return /^\d{4}$/.test(last4.trim());
    if (method === 'stripe') return stripeConnected && stripeId.trim().length > 0;
    if (method === 'paypal') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail.trim());
    return false;
  }

  async function handleConnectStripe() {
    setStripeConnecting(true);
    // Mock the Stripe Connect redirect round-trip. Real impl opens
    // Stripe Connect onboarding in a popup and returns an acct_* id.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const generatedId = `acct_mock_${Math.random().toString(36).slice(2, 10)}`;
    setStripeId(generatedId);
    setStripeConnected(true);
    setStripeConnecting(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid()) {
      setError(t('creator.onboarding.required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: PayoutPayload = { method };
      if (method === 'bank') payload.last4 = last4.trim();
      else if (method === 'stripe') payload.stripe_id = stripeId.trim();
      else if (method === 'paypal') payload.paypal_email = paypalEmail.trim();
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payout save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4"
      data-testid="onboarding-step2-payout"
    >
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {t('creator.onboarding.payout.heading')}
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">
            {t('creator.onboarding.payout.method')}
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {METHODS.map((opt) => (
              <label
                key={opt.value}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition',
                  method === opt.value
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <input
                  type="radio"
                  name="payout-method"
                  value={opt.value}
                  checked={method === opt.value}
                  onChange={() => setMethod(opt.value)}
                  className="h-4 w-4 text-brand-600"
                />
                <span>{t(opt.labelKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {method === 'bank' && (
          <div>
            <label
              htmlFor="payout-bank-last4"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.onboarding.payout.bankLast4')}
            </label>
            <input
              id="payout-bank-last4"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="0000"
            />
          </div>
        )}

        {method === 'stripe' && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="payout-stripe-id"
                className="block text-sm font-medium text-slate-700"
              >
                {t('creator.onboarding.payout.stripeId')}
              </label>
              <input
                id="payout-stripe-id"
                type="text"
                value={stripeId}
                readOnly={stripeConnected}
                onChange={(e) => setStripeId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="acct_..."
              />
            </div>
            <button
              type="button"
              onClick={handleConnectStripe}
              disabled={stripeConnecting}
              className="inline-flex items-center justify-center rounded-md border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="onboarding-stripe-connect"
            >
              {stripeConnecting
                ? '…'
                : stripeConnected
                  ? 'Re-connect with Stripe'
                  : t('creator.onboarding.payout.connect')}
            </button>
          </div>
        )}

        {method === 'paypal' && (
          <div>
            <label
              htmlFor="payout-paypal-email"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.onboarding.payout.paypalEmail')}
            </label>
            <input
              id="payout-paypal-email"
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="[email protected]"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isValid() || submitting}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="onboarding-payout-save"
          >
            {submitting ? '…' : t('creator.onboarding.payout.save')}
          </button>
        </div>
      </form>
    </section>
  );
}