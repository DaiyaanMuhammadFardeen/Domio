'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Upload, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { fetcher } from '../../../lib/fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

const KINDS = [
  { value: 'component', label: 'Component' },
  { value: 'template', label: 'Template' },
  { value: 'theme', label: 'Theme' },
  { value: 'sticker_pack', label: 'Sticker Pack' },
  { value: 'icon_pack', label: 'Icon Pack' },
] as const;

const PRICING_MODELS = [
  { value: 'free', label: 'Free' },
  { value: 'one_time', label: 'One-time Purchase' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'team_seats', label: 'Team Seats' },
  { value: 'enterprise_quote', label: 'Enterprise Quote' },
] as const;

interface FormData {
  // Step 1: Assets
  assets: File[];
  // Step 2: Details
  title: string;
  kind: string;
  description: string;
  tags: string;
  catalog_id: string;
  license_id: string;
  // Step 3: Pricing
  price_model: string;
  price_cents: number;
  currency: string;
}

const INITIAL_FORM: FormData = {
  assets: [],
  title: '',
  kind: 'component',
  description: '',
  tags: '',
  catalog_id: '',
  license_id: '',
  price_model: 'free',
  price_cents: 0,
  currency: 'USD',
};

const STEPS = ['Assets', 'Details', 'Pricing', 'Review'];

export default function CreateListingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function updateForm(partial: Partial<FormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      updateForm({ assets: [...form.assets, ...Array.from(e.dataTransfer.files)] });
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      updateForm({ assets: [...form.assets, ...Array.from(e.target.files)] });
    }
  }

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);

      const payload: Record<string, unknown> = {
        catalog_id: form.catalog_id || `cat-${Date.now()}`,
        seller_id: 'current-user', // Would be from auth context
        title: form.title,
        kind: form.kind,
        license_id: form.license_id || `lic-${Date.now()}`,
        ...(form.description ? { description: form.description } : {}),
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        price: {
          model: form.price_model,
          price_cents: form.price_cents,
          currency: form.currency,
        },
      };

      await fetcher(API_BASE, '/v1/marketplace/listings', {
        method: 'POST',
        body: payload,
      });

      router.push('/listings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: // Assets - optional for now
        return true;
      case 1: // Details
        return form.title.length > 0;
      case 2: // Pricing
        return true;
      default:
        return true;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/listings"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to listings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('create.title')}</h1>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i < step
                  ? 'bg-brand-600 text-white'
                  : i === step
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                i === step ? 'text-slate-900' : 'text-slate-500'
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('create.step.assets')}</h2>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                dragActive
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400'
              }`}
            >
              <Upload className="h-10 w-10 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                {t('create.assets.dropzone')}
              </p>
              <p className="mt-1 text-xs text-slate-500">{t('create.assets.hint')}</p>
              <label className="mt-4 cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm border border-slate-300 hover:bg-slate-50">
                Choose files
                <input
                  type="file"
                  multiple
                  accept=".zip,.tgz,.json"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
            </div>
            {form.assets.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Uploaded files:</p>
                {form.assets.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">{file.name}</span>
                    <button
                      onClick={() => updateForm({ assets: form.assets.filter((_, j) => j !== i) })}
                      className="text-xs text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Note: Files are stored as manifest metadata. Actual upload is not yet implemented.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('create.step.details')}</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('create.details.title')} *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                placeholder={t('create.details.titlePlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('create.details.kind')}
              </label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {KINDS.map((kind) => (
                  <button
                    key={kind.value}
                    onClick={() => updateForm({ kind: kind.value })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.kind === kind.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('create.details.description')}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder={t('create.details.descriptionPlaceholder')}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('create.details.tags')}
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => updateForm({ tags: e.target.value })}
                placeholder={t('create.details.tagsPlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('create.step.pricing')}</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('create.pricing.model')}
              </label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {PRICING_MODELS.map((model) => (
                  <button
                    key={model.value}
                    onClick={() => updateForm({ price_model: model.value })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.price_model === model.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </div>
            {form.price_model !== 'free' && form.price_model !== 'enterprise_quote' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t('create.pricing.price')} (cents)
                  </label>
                  <input
                    type="number"
                    value={form.price_cents}
                    onChange={(e) => updateForm({ price_cents: Number(e.target.value) })}
                    placeholder={t('create.pricing.pricePlaceholder')}
                    min={0}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Displayed as: ${(form.price_cents / 100).toFixed(2)} {form.currency}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    {t('create.pricing.currency')}
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) => updateForm({ currency: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="BDT">BDT</option>
                  </select>
                </div>
              </div>
            )}
            {form.price_model === 'enterprise_quote' && (
              <p className="text-sm text-slate-500">
                Enterprise listings will display "Contact for pricing" to buyers.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t('create.review.title')}</h2>
            <div className="space-y-3 rounded-lg bg-slate-50 p-4">
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Title</span>
                <p className="text-sm text-slate-900">{form.title || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Kind</span>
                <p className="text-sm text-slate-900">
                  {KINDS.find((k) => k.value === form.kind)?.label}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Description</span>
                <p className="text-sm text-slate-900">{form.description || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Tags</span>
                <p className="text-sm text-slate-900">{form.tags || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Pricing</span>
                <p className="text-sm text-slate-900">
                  {form.price_model === 'free'
                    ? 'Free'
                    : form.price_model === 'enterprise_quote'
                      ? 'Enterprise Quote'
                      : `${PRICING_MODELS.find((m) => m.value === form.price_model)?.label}: $${(form.price_cents / 100).toFixed(2)} ${form.currency}`}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-slate-500">Assets</span>
                <p className="text-sm text-slate-900">
                  {form.assets.length > 0 ? `${form.assets.length} file(s) selected` : 'No files selected'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('create.back')}
        </button>
        <div className="flex gap-3">
          {step === STEPS.length - 1 ? (
            <>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('create.review.saveDraft')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : t('create.review.submit')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canProceed()}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {t('create.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
