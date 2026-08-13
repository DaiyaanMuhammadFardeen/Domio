'use client';

import { useId, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import type { IdentityPayload } from '../../lib/onboarding-service';

export interface Step1IdentityProps {
  readonly defaultValues?: Partial<IdentityPayload>;
  readonly onSubmit: (payload: IdentityPayload) => Promise<void>;
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

const ID_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's license" },
  { value: 'national_id', label: 'National ID card' },
];

export function Step1Identity({ defaultValues, onSubmit }: Step1IdentityProps) {
  const { t } = useI18n();
  const headingId = useId();
  const [legalName, setLegalName] = useState<string>(defaultValues?.legal_name ?? '');
  const [dob, setDob] = useState<string>(defaultValues?.dob ?? '');
  const [country, setCountry] = useState<string>(defaultValues?.country ?? 'US');
  const [idType, setIdType] = useState<string>('passport');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    legalName.trim().length > 0 && dob.trim().length > 0 && country.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) {
      setError(t('creator.onboarding.required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        legal_name: legalName.trim(),
        country,
        dob,
        persona_id: `persona_${idType}_${Math.random().toString(36).slice(2, 10)}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity verification failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4"
      data-testid="onboarding-step1-identity"
    >
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {t('creator.onboarding.identity.heading')}
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="identity-legal-name"
            className="block text-sm font-medium text-slate-700"
          >
            {t('creator.onboarding.identity.legalName')}
          </label>
          <input
            id="identity-legal-name"
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="identity-dob"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.onboarding.identity.dob')}
            </label>
            <input
              id="identity-dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label
              htmlFor="identity-country"
              className="block text-sm font-medium text-slate-700"
            >
              {t('creator.onboarding.identity.country')}
            </label>
            <select
              id="identity-country"
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
        </div>
        <div>
          <label
            htmlFor="identity-id-type"
            className="block text-sm font-medium text-slate-700"
          >
            {t('creator.onboarding.identity.idType')}
          </label>
          <select
            id="identity-id-type"
            value={idType}
            onChange={(e) => setIdType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {ID_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="onboarding-identity-verify"
          >
            {submitting ? '…' : t('creator.onboarding.identity.verify')}
          </button>
        </div>
      </form>
    </section>
  );
}