'use client';

/**
 * SliderBidirectional — audience-side slider for a two-way slide.
 *
 * Per Wave 11 §S11.7 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The audience member moves the slider on their phone. The component
 * keeps a local copy of the state and shows both values:
 *   - Your value (the one they're moving).
 *   - Presenter's value (what the presenter is at).
 *   - The midpoint (the negotiated value).
 *
 * The component is controlled — it loads the initial state from
 * `listBidirSliders` and emits `onAdjust` so the parent can route it
 * to the engine / network. Local fallback persists to in-memory state
 * so the demo works without a backend.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import {
  adjustBidirSlider,
  listBidirSliders,
  type BidirSlider,
} from '@/lib/two-way-service';

export interface SliderBidirectionalProps {
  readonly slideId: string;
  readonly sliderId: string;
  /** Optional loader override (used by tests). */
  readonly loadSliders?: (slideId: string) => Promise<BidirSlider[]>;
  /** Optional adjuster override (used by tests). */
  readonly onAdjust?: (
    slideId: string,
    sliderId: string,
    value: number,
  ) => Promise<BidirSlider>;
  /** Optional current presenter value (synced from the engine). */
  readonly presenterValue?: number;
  readonly dataTestId?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function SliderBidirectional({
  slideId,
  sliderId,
  loadSliders,
  onAdjust,
  presenterValue,
  dataTestId = 'slider-bidir',
}: SliderBidirectionalProps): ReactElement {
  const [slider, setSlider] = useState<BidirSlider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const adjustImpl = useMemo(
    () => onAdjust ?? ((sid: string, sidId: string, value: number) => adjustBidirSlider(sid, sidId, value)),
    [onAdjust],
  );

  const loadImpl = useMemo(
    () => loadSliders ?? ((sid: string) => listBidirSliders(sid)),
    [loadSliders],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadImpl(slideId)
      .then((sliders) => {
        if (cancelled) return;
        const found = sliders.find((s) => s.id === sliderId) ?? null;
        setSlider(found);
        setLoading(false);
        if (!found) {
          setError(`Slider ${sliderId} not found on slide ${slideId}`);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load slider');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slideId, sliderId, loadImpl]);

  const handleChange = useCallback(
    async (value: number) => {
      if (!slider) return;
      const updated = await adjustImpl(slideId, sliderId, value);
      setSlider(updated);
    },
    [adjustImpl, slideId, sliderId, slider],
  );

  // If the parent streams a new presenter value (via the engine bus),
  // reconcile it locally.
  useEffect(() => {
    if (typeof presenterValue !== 'number' || !slider) return;
    const clamped = clamp(presenterValue, slider.min, slider.max);
    if (clamped === slider.presenter_value) return;
    setSlider((prev) =>
      prev
        ? {
            ...prev,
            presenter_value: clamped,
            midpoint: (clamped + prev.audience_value) / 2,
            converged: Math.abs(clamped - prev.audience_value) <= prev.step / 2,
          }
        : prev,
    );
  }, [presenterValue, slider]);

  if (loading) {
    return (
      <div
        data-testid={dataTestId}
        data-loading="true"
        className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500"
      >
        Loading slider…
      </div>
    );
  }

  if (error || !slider) {
    return (
      <div
        data-testid={dataTestId}
        data-error={error ?? 'not-found'}
        className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700"
      >
        {error ?? 'Slider not found.'}
      </div>
    );
  }

  const youRounded = Math.round(slider.audience_value);
  const presenterRounded = Math.round(slider.presenter_value);
  const midpointRounded = Math.round(slider.midpoint);

  return (
    <div
      data-testid={dataTestId}
      data-slider-id={slider.id}
      data-converged={slider.converged}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900" data-testid={`${dataTestId}-label`}>
          {slider.label}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            slider.converged ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
          data-testid={`${dataTestId}-converged`}
        >
          {slider.converged ? 'Converged' : 'Negotiating'}
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${dataTestId}-range`}
          className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
        >
          Your value
        </label>
        <input
          id={`${dataTestId}-range`}
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={slider.audience_value}
          onChange={(e) => handleChange(Number(e.target.value))}
          data-testid={`${dataTestId}-input`}
          aria-label={`${slider.label} your value`}
          className="w-full accent-sky-500"
        />
      </div>

      <dl className="grid grid-cols-3 gap-3 text-sm text-slate-700">
        <div className="flex flex-col gap-1">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Your value
          </dt>
          <dd
            className="tabular-nums text-base font-semibold"
            data-testid={`${dataTestId}-your-value`}
          >
            {youRounded} {slider.unit}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Presenter's value
          </dt>
          <dd
            className="tabular-nums text-base font-semibold"
            data-testid={`${dataTestId}-presenter-value`}
          >
            {presenterRounded} {slider.unit}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Midpoint
          </dt>
          <dd
            className="tabular-nums text-base font-semibold text-emerald-700"
            data-testid={`${dataTestId}-midpoint`}
          >
            {midpointRounded} {slider.unit}
          </dd>
        </div>
      </dl>
    </div>
  );
}