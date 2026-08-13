'use client';

import { useId, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import type { TaxIdType, TaxPayload } from '../../lib/onboarding-service';

export interface Step3TaxProps {
  readonly defaultValues?: Partial<TaxPayload>;
  readonly onSubmit: (payload: TaxPayload) => Promise<void>;
}

const COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BD', name: 'Bangladesh' },
];

const ID_TYPES: ReadonlyArray<{ value: TaxIdType; label: string }> = [
  { value: 'ssn', label: 'SSN (US Social Security)' },
  { value: 'ein', label: 'EIN (US Employer ID)' },
  { value: 'vat', label: 'VAT (EU)' },
  { value: 'none', label: 'None / Not yet' },
];

export function Step3Tax({ defaultValues, onSubmit }: Step3TaxProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [country, setCountry] = useState<string>(defaultValues?.country ?? 'US');
  const [idType, setIdType] = useState<TaxIdType>(defaultValues?.id_type ?? 'ssn');
  const [idValue, setIdValue] = useState<string>(defaultValues?.id_value ?? '');
  const [treaty, setTreaty] = useState<boolean>(defaultValues?.treaty ?? false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  function isValid(): boolean {
    if (country.trim().length === 0) return false;
    if (idType === 'none') return true;
    return idValue.trim().length > 0;
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
      const payload: TaxPayload = { country, id_type: idType, treaty };
      if (idType !== 'none') payload.id_value = idValue.trim();
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tax info save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4" data-testid="onboarding-step3-tax">
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {t('creator.onboarding.tax.heading')}
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="tax-country" className="block text-sm font-medium text-slate-700">
            {t('creator.onboarding.tax.country')}
          </label>
          <select
            id="tax-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tax-id-type" className="block text-sm font-medium text-slate-700">
            {t('creator.onboarding.tax.idType')}
          </label>
          <select
            id="tax-id-type"
            value={idType}
            onChange={(e) => setIdType(e.target.value as TaxIdType)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {ID_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {idType !== 'none' && (
          <div>
            <label htmlFor="tax-id-value" className="block text-sm font-medium text-slate-700">
              {t('creator.onboarding.tax.idValue')}
            </label>
            <input
              id="tax-id-value"
              type="text"
              value={idValue}
              onChange={(e) => setIdValue(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={treaty}
            onChange={(e) => setTreaty(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            data-testid="onboarding-tax-treaty"
          />
          <span>{t('creator.onboarding.tax.treaty')}</span>
        </label>

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
            data-testid="onboarding-tax-save"
          >
            {submitting ? '…' : t('creator.onboarding.tax.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
