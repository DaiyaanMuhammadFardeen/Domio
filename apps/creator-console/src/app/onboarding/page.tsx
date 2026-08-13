'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import {
  getOnboarding,
  submitIdentity,
  submitPayout,
  submitTax,
  type IdentityPayload,
  type OnboardingState,
  type OnboardingStep,
  type PayoutPayload,
  type TaxPayload,
} from '../../lib/onboarding-service';
import {
  ProgressBar,
  Step1Identity,
  Step2Payout,
  Step3Tax,
  Step4FirstListing,
} from '../../components/onboarding';

const STEP_LABELS: Record<OnboardingStep, string> = {
  identity: 'creator.onboarding.step.identity',
  payout: 'creator.onboarding.step.payout',
  tax: 'creator.onboarding.step.tax',
  listing: 'creator.onboarding.step.listing',
};

const STEP_ORDER: ReadonlyArray<OnboardingStep> = [
  'identity',
  'payout',
  'tax',
  'listing',
];

const STEP_DESCRIPTORS = STEP_ORDER.map((key) => ({
  key,
  label: STEP_LABELS[key],
}));

function getWorkspaceId(): string {
  if (typeof window === 'undefined') return 'ws-demo';
  return (
    process.env['NEXT_PUBLIC_WORKSPACE_ID'] ??
    new URLSearchParams(window.location.search).get('workspace_id') ??
    'ws-demo'
  );
}

export default function OnboardingPage() {
  const { t } = useI18n();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<OnboardingStep>('identity');

  const workspaceId = useMemo(getWorkspaceId, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const initial = await getOnboarding(workspaceId);
        if (cancelled) return;
        setState(initial);
        setActiveStep(initial.current_step);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load onboarding');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const goNext = useCallback(() => {
    setActiveStep((current) => {
      const idx = STEP_ORDER.indexOf(current);
      if (idx === -1 || idx >= STEP_ORDER.length - 1) return current;
      return STEP_ORDER[idx + 1] ?? current;
    });
  }, []);

  const goPrev = useCallback(() => {
    setActiveStep((current) => {
      const idx = STEP_ORDER.indexOf(current);
      if (idx <= 0) return current;
      return STEP_ORDER[idx - 1] ?? current;
    });
  }, []);

  const handleIdentity = useCallback(
    async (payload: IdentityPayload) => {
      const next = await submitIdentity(workspaceId, payload);
      setState(next);
      goNext();
    },
    [workspaceId, goNext],
  );

  const handlePayout = useCallback(
    async (payload: PayoutPayload) => {
      const next = await submitPayout(workspaceId, payload);
      setState(next);
      goNext();
    },
    [workspaceId, goNext],
  );

  const handleTax = useCallback(
    async (payload: TaxPayload) => {
      const next = await submitTax(workspaceId, payload);
      setState(next);
      goNext();
    },
    [workspaceId, goNext],
  );

  const handleJumpToCompleted = useCallback(
    (step: OnboardingStep) => {
      if (state?.completed.includes(step)) {
        setActiveStep(step);
      }
    },
    [state],
  );

  if (loading || !state) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Loading onboarding…
      </div>
    );
  }

  const descriptors = STEP_DESCRIPTORS.map((d) => ({
    key: d.key,
    label: t(d.label),
  }));

  const currentIdx = STEP_ORDER.indexOf(activeStep);
  const stepIsComplete = state.completed.includes(activeStep);
  const isFinalStep = activeStep === 'listing';

  return (
    <div className="space-y-6" data-testid="onboarding-page">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('creator.onboarding.heading')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('creator.onboarding.subheading')}
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <ProgressBar
          current={activeStep}
          steps={descriptors}
          completed={state.completed}
          onJump={handleJumpToCompleted}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        {error && (
          <p
            className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {activeStep === 'identity' && (
          <Step1Identity
            defaultValues={{
              ...(state.identity.legal_name
                ? { legal_name: state.identity.legal_name }
                : {}),
              ...(state.identity.country
                ? { country: state.identity.country }
                : {}),
            }}
            onSubmit={handleIdentity}
          />
        )}
        {activeStep === 'payout' && (
          <Step2Payout
            defaultValues={{
              method: state.payout.method,
              ...(state.payout.last4 ? { last4: state.payout.last4 } : {}),
              ...(state.payout.stripe_id
                ? { stripe_id: state.payout.stripe_id }
                : {}),
              ...(state.payout.paypal_email
                ? { paypal_email: state.payout.paypal_email }
                : {}),
            }}
            onSubmit={handlePayout}
          />
        )}
        {activeStep === 'tax' && (
          <Step3Tax
            defaultValues={{
              country: state.tax.country,
              id_type: state.tax.id_type,
              ...(state.tax.id_value ? { id_value: state.tax.id_value } : {}),
              treaty: state.tax.treaty,
            }}
            onSubmit={handleTax}
          />
        )}
        {activeStep === 'listing' && <Step4FirstListing state={state} />}

        {!isFinalStep && currentIdx > 0 && (
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
              data-testid="onboarding-back"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('creator.onboarding.back')}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!stepIsComplete}
              title={
                stepIsComplete
                  ? undefined
                  : t('creator.onboarding.required')
              }
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
              data-testid="onboarding-next"
            >
              {t('creator.onboarding.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
