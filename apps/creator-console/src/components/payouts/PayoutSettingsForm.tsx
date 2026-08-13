'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type {
  PayoutMethod,
  PayoutSchedule,
  PayoutSettings,
  PayoutSettingsInput,
} from '../../lib/types';

export interface PayoutSettingsFormProps {
  readonly settings: PayoutSettings;
  readonly onSave: (input: PayoutSettingsInput) => Promise<void>;
}

const METHOD_OPTIONS: ReadonlyArray<{ value: PayoutMethod; label: string }> = [
  { value: 'bank-transfer', label: 'Bank transfer' },
  { value: 'stripe-connect', label: 'Stripe Connect' },
  { value: 'paypal', label: 'PayPal' },
];

const SCHEDULE_OPTIONS: ReadonlyArray<{ value: PayoutSchedule; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'manual', label: 'Manual' },
];

export function PayoutSettingsForm({ settings, onSave }: PayoutSettingsFormProps) {
  const [method, setMethod] = useState<PayoutMethod>(settings.method);
  const [schedule, setSchedule] = useState<PayoutSchedule>(settings.schedule);
  const [minPayoutCents, setMinPayoutCents] = useState<number>(
    settings.min_payout_cents,
  );
  const [bankLast4, setBankLast4] = useState<string>(
    settings.bank_account_last4 ?? '',
  );
  const [stripeConnectId, setStripeConnectId] = useState<string>(
    settings.stripe_connect_id ?? '',
  );
  const [paypalEmail, setPaypalEmail] = useState<string>(
    settings.paypal_email ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: PayoutSettingsInput = {
        method,
        schedule,
        min_payout_cents: minPayoutCents,
        ...(method === 'bank-transfer' && { bank_account_last4: bankLast4 }),
        ...(method === 'stripe-connect' && { stripe_connect_id: stripeConnectId }),
        ...(method === 'paypal' && { paypal_email: paypalEmail }),
      };
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="payout-settings"
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">
          Method
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          {METHOD_OPTIONS.map((m) => (
            <label
              key={m.value}
              data-testid={`payout-method-${m.value}`}
              className={clsx(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                method === m.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="payout-method"
                value={m.value}
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
                className="sr-only"
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {method === 'bank-transfer' && (
        <div>
          <label
            htmlFor="payout-bank-last4"
            className="block text-sm font-medium text-slate-700"
          >
            Bank account last 4
          </label>
          <input
            id="payout-bank-last4"
            data-testid="payout-bank-last4"
            type="text"
            value={bankLast4}
            onChange={(e) => setBankLast4(e.target.value)}
            placeholder="1234"
            maxLength={4}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      {method === 'stripe-connect' && (
        <div>
          <label
            htmlFor="payout-stripe-connect"
            className="block text-sm font-medium text-slate-700"
          >
            Stripe Connect ID
          </label>
          <input
            id="payout-stripe-connect"
            data-testid="payout-stripe-connect"
            type="text"
            value={stripeConnectId}
            onChange={(e) => setStripeConnectId(e.target.value)}
            placeholder="acct_..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      {method === 'paypal' && (
        <div>
          <label
            htmlFor="payout-paypal-email"
            className="block text-sm font-medium text-slate-700"
          >
            PayPal email
          </label>
          <input
            id="payout-paypal-email"
            data-testid="payout-paypal-email"
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="[email protected]"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">
          Schedule
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {SCHEDULE_OPTIONS.map((s) => (
            <label
              key={s.value}
              data-testid={`payout-schedule-${s.value}`}
              className={clsx(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                schedule === s.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="payout-schedule"
                value={s.value}
                checked={schedule === s.value}
                onChange={() => setSchedule(s.value)}
                className="sr-only"
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="payout-min-amount"
          className="block text-sm font-medium text-slate-700"
        >
          Minimum payout (cents)
        </label>
        <input
          id="payout-min-amount"
          data-testid="payout-min-amount"
          type="number"
          min={0}
          value={minPayoutCents}
          onChange={(e) => setMinPayoutCents(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          data-testid="payout-save"
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}