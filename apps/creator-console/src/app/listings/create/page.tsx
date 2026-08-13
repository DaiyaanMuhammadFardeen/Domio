'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  addAsset,
  createDraft,
  removeAsset as removeAssetSvc,
  saveDetails,
  savePricing,
  submitForReview,
} from '../../../lib/wizard-service';
import type {
  AssetKind,
  AssetUpload,
  MarketplaceListing,
  WizardDraft,
  WizardStep,
} from '../../../lib/types';
import { useI18n } from '../../../lib/i18n';
import { DetailsStep } from '../../../components/wizard/DetailsStep';
import { FilesStep } from '../../../components/wizard/FilesStep';
import { MediaStep } from '../../../components/wizard/MediaStep';
import { PreviewTab } from '../../../components/wizard/PreviewTab';
import { PricingStep } from '../../../components/wizard/PricingStep';
import { StepIndicator } from '../../../components/wizard/StepIndicator';
import { creatorConsole } from '@domio/ui/routing';

const STEP_ORDER: ReadonlyArray<WizardStep> = ['details', 'media', 'files', 'pricing'];

function nextStep(current: WizardStep): WizardStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx === STEP_ORDER.length - 1) return current;
  return STEP_ORDER[idx + 1] ?? current;
}

function prevStep(current: WizardStep): WizardStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx <= 0) return current;
  return STEP_ORDER[idx - 1] ?? current;
}

const STEP_LABELS: ReadonlyArray<{ key: WizardStep; labelKey: string }> = [
  { key: 'details', labelKey: 'creator.wizard.step.details' },
  { key: 'media', labelKey: 'creator.wizard.step.media' },
  { key: 'files', labelKey: 'creator.wizard.step.files' },
  { key: 'pricing', labelKey: 'creator.wizard.step.pricing' },
];

export default function CreateListingWizardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<MarketplaceListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await createDraft();
        if (!cancelled) setDraft(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to create draft');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDetailsSave = useCallback(
    async (details: Parameters<typeof saveDetails>[1]) => {
      if (!draft) return;
      try {
        const updated = await saveDetails(draft.id, details);
        setDraft(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save details');
      }
    },
    [draft],
  );

  const handleAddAsset = useCallback(
    async (kind: AssetKind, file: File) => {
      if (!draft) return;
      try {
        const upload = await addAsset(draft.id, kind, file);
        setDraft({
          ...draft,
          assets: [...draft.assets, upload],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add asset');
      }
    },
    [draft],
  );

  const handleRemoveAsset = useCallback(
    async (id: string) => {
      if (!draft) return;
      try {
        await removeAssetSvc(id);
        setDraft({ ...draft, assets: draft.assets.filter((a) => a.id !== id) });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to remove asset');
      }
    },
    [draft],
  );

  const handlePricingSave = useCallback(
    async (pricing: Parameters<typeof savePricing>[1]) => {
      if (!draft) return;
      try {
        const updated = await savePricing(draft.id, pricing);
        setDraft(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save pricing');
      }
    },
    [draft],
  );

  const handleSaveDraft = useCallback(() => {
    if (!draft) return;
    router.push(creatorConsole('listings'));
  }, [draft, router]);

  const handleSubmit = useCallback(async () => {
    if (!draft) return;
    try {
      setSubmitting(true);
      setError(null);
      const listing = await submitForReview(draft.id);
      setSubmitted(listing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [draft]);

  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-testid="wizard-page">
        <p className="text-sm text-slate-500">Initialising draft…</p>
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl space-y-6" data-testid="wizard-page">
        <h1 className="text-2xl font-semibold tracking-tight">{t('creator.wizard.submitted')}</h1>
        <p className="text-sm text-slate-500">{submitted.title}</p>
        <button
          type="button"
          onClick={() => router.push(creatorConsole('listings'))}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Back to listings
        </button>
      </div>
    );
  }

  const nextDisabled =
    draft.step === 'details'
      ? !draft.details
      : draft.step === 'media'
        ? !draft.assets.some((a: AssetUpload) => a.kind === 'cover')
        : draft.step === 'files'
          ? false
          : !draft.pricing;

  return (
    <div
      className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]"
      data-testid="wizard-page"
    >
      <div className="space-y-6">
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(creatorConsole('listings'))}
            aria-label="Back"
            className="inline-flex items-center gap-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{t('creator.wizard.title')}</h1>
        </header>

        <StepIndicator
          current={draft.step}
          steps={STEP_LABELS.map((s) => ({ key: s.key, label: t(s.labelKey) }))}
        />

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {draft.step === 'details' && (
            <DetailsStep details={draft.details} onSave={handleDetailsSave} />
          )}
          {draft.step === 'media' && (
            <MediaStep assets={draft.assets} onAdd={handleAddAsset} onRemove={handleRemoveAsset} />
          )}
          {draft.step === 'files' && (
            <FilesStep assets={draft.assets} onAdd={handleAddAsset} onRemove={handleRemoveAsset} />
          )}
          {draft.step === 'pricing' && (
            <PricingStep pricing={draft.pricing} onSave={handlePricingSave} />
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setDraft({ ...draft, step: prevStep(draft.step) })}
            disabled={draft.step === 'details'}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('creator.wizard.back')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, step: nextStep(draft.step) })}
              disabled={nextDisabled}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {t('creator.wizard.next')}
            </button>
            <button
              type="button"
              data-testid="wizard-save-draft"
              onClick={handleSaveDraft}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('creator.wizard.saveDraft')}
            </button>
            <button
              type="button"
              data-testid="wizard-submit"
              onClick={handleSubmit}
              disabled={submitting || draft.step !== 'pricing' || !draft.pricing}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : t('creator.wizard.submit')}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-[80px] lg:self-start">
        <PreviewTab draft={draft} />
      </div>
    </div>
  );
}
