'use client';

import { useState } from 'react';
import type { PriceModel, WizardPricing } from '../../lib/types';
import { useI18n } from '../../lib/i18n';

export interface PricingStepProps {
  readonly pricing: WizardPricing | null;
  readonly onSave: (p: WizardPricing) => void;
}

interface ModelOption {
  readonly value: PriceModel;
  readonly labelKey: string;
}

const MODELS: ReadonlyArray<ModelOption> = [
  { value: 'free', labelKey: 'creator.wizard.pricing.model.free' },
  { value: 'one_time', labelKey: 'creator.wizard.pricing.model.oneTime' },
  { value: 'subscription', labelKey: 'creator.wizard.pricing.model.subscription' },
  { value: 'team_seats', labelKey: 'creator.wizard.pricing.model.teamSeats' },
  { value: 'enterprise_quote', labelKey: 'creator.wizard.pricing.model.enterpriseQuote' },
];

const CURRENCIES: ReadonlyArray<string> = ['USD', 'EUR', 'GBP', 'BDT'];

export function PricingStep({ pricing, onSave }: PricingStepProps) {
  const { t } = useI18n();
  const [model, setModel] = useState<PriceModel>(pricing?.model ?? 'free');
  const [priceCents, setPriceCents] = useState<number>(pricing?.price_cents ?? 0);
  const [currency, setCurrency] = useState<string>(pricing?.currency ?? 'USD');
  const [interval, setInterval] = useState<'monthly' | 'yearly' | null>(
    pricing?.subscription_interval ?? null,
  );
  const [royaltyBps, setRoyaltyBps] = useState<number | null>(
    pricing?.royalty_bps ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (model === 'subscription' && interval === null) {
      setError('Pick a subscription interval');
      return;
    }
    if (
      model !== 'free' &&
      model !== 'enterprise_quote' &&
      priceCents < 0
    ) {
      setError('Price must be ≥ 0');
      return;
    }
    setError(null);
    onSave({
      model,
      price_cents: model === 'free' || model === 'enterprise_quote' ? 0 : priceCents,
      currency,
      subscription_interval: model === 'subscription' ? interval : null,
      royalty_bps: royaltyBps,
    });
  }

  const showAmount = model !== 'free' && model !== 'enterprise_quote';
  const showRoyalty = model !== 'free';

  return (
    <section
      className="space-y-5"
      data-testid="wizard-step-pricing"
      aria-labelledby="wizard-pricing-heading"
    >
      <h2 id="wizard-pricing-heading" className="text-lg font-medium text-slate-900">
        {t('creator.wizard.pricing.heading')}
      </h2>

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
          {t('creator.wizard.pricing.model')}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          {MODELS.map((m) => (
            <label
              key={m.value}
              data-testid={`wizard-model-${m.value}`}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                model === m.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="wizard-pricing-model"
                value={m.value}
                checked={model === m.value}
                onChange={() => setModel(m.value)}
                className="sr-only"
              />
              <span>{t(m.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {showAmount && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="wizard-price-cents"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.wizard.pricing.amount')}
            </label>
            <input
              id="wizard-price-cents"
              data-testid="wizard-price-cents"
              type="number"
              min={0}
              value={priceCents}
              onChange={(e) => setPriceCents(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label
              htmlFor="wizard-currency"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.wizard.pricing.currency')}
            </label>
            <select
              id="wizard-currency"
              data-testid="wizard-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {model === 'subscription' && (
        <div>
          <label
            htmlFor="wizard-interval"
            className="block text-sm font-medium text-slate-700"
          >
            {t('creator.wizard.pricing.subscriptionInterval')}
          </label>
          <select
            id="wizard-interval"
            data-testid="wizard-interval"
            value={interval ?? ''}
            onChange={(e) => setInterval(e.target.value as 'monthly' | 'yearly' | null)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="" disabled>
              Pick…
            </option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      )}

      {showRoyalty && (
        <div>
          <label
            htmlFor="wizard-royalty-bps"
            className="block text-sm font-medium text-slate-700"
          >
            {t('creator.wizard.pricing.royaltyBps')}
          </label>
          <input
            id="wizard-royalty-bps"
            data-testid="wizard-royalty-bps"
            type="number"
            min={0}
            max={10000}
            value={royaltyBps ?? ''}
            onChange={(e) =>
              setRoyaltyBps(e.target.value === '' ? null : Number(e.target.value))
            }
            placeholder="e.g. 1500 = 15%"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          data-testid="wizard-next"
          onClick={handleSave}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          {t('creator.wizard.next')}
        </button>
      </div>
    </section>
  );
}