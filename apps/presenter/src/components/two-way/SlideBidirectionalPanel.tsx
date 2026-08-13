'use client';

/**
 * SlideBidirectionalPanel — presenter-side control for two-way slides.
 *
 * Per Wave 11 §S11.7 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The presenter sees each bidirectional slider with two markers:
 *   - Their own (presenter) value.
 *   - The audience's value as it moves in real time.
 * When both sides have moved, the markers animate toward the midpoint
 * (the "negotiated" value). The presenter can move their side, reset
 * to either side's value, and save the final values to the deck.
 *
 * The component is a controlled shell — it loads the slider state from
 * the service and emits `onAdjust(slider)` so a parent can route the
 * change to the engine. For the demo we pass through the local
 * service directly via the default props.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import {
  adjustBidirSlider,
  listBidirSliders,
  saveBidirToDeck,
  type BidirAdjustment,
  type BidirSlider,
} from '../../lib/two-way-service';
import { NegotiationLog } from './NegotiationLog';

export interface SlideBidirectionalPanelProps {
  readonly slideId: string;
  /** Optional override for the loader (used by tests). */
  readonly loadSliders?: (slideId: string) => Promise<BidirSlider[]>;
  /** Optional override for the adjuster (used by tests). */
  readonly onAdjust?: (
    slideId: string,
    sliderId: string,
    value: number,
    actor: BidirAdjustment['actor'],
  ) => Promise<BidirSlider>;
  /** Optional override for the save (used by tests). */
  readonly onSave?: (slideId: string) => Promise<{ saved_at_ms: number }>;
  /** Optional current adjustments for the log (used by tests). */
  readonly adjustments?: ReadonlyArray<BidirAdjustment>;
  /** Optional changes feed; when provided, the panel reloads sliders. */
  readonly refreshKey?: string | number;
  readonly dataTestId?: string;
}

type ResetTarget = 'presenter' | 'audience';

interface MarkerState {
  /** Pixel left of the presenter marker. */
  readonly presenterX: number;
  /** Pixel left of the audience marker. */
  readonly audienceX: number;
  /** Pixel left of the midpoint marker. */
  readonly midpointX: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fractionToPx(value: number, min: number, max: number, trackWidth: number): number {
  if (max <= min) return 0;
  const pct = clamp((value - min) / (max - min), 0, 1);
  return pct * trackWidth;
}

export function SlideBidirectionalPanel({
  slideId,
  loadSliders,
  onAdjust,
  onSave,
  adjustments,
  refreshKey,
  dataTestId = 'slide-bidir-panel',
}: SlideBidirectionalPanelProps): ReactElement {
  const [sliders, setSliders] = useState<BidirSlider[]>([]);
  const [log, setLog] = useState<BidirAdjustment[]>([]);
  const [savedAtMs, setSavedAtMs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const adjustImpl = useMemo(
    () =>
      onAdjust ??
      (async (sid: string, sidId: string, value: number, actor: BidirAdjustment['actor']) => {
        return adjustBidirSlider(sid, sidId, value, actor);
      }),
    [onAdjust],
  );

  const loadImpl = useMemo(
    () => loadSliders ?? ((sid: string) => listBidirSliders(sid)),
    [loadSliders],
  );

  const saveImpl = useMemo(() => onSave ?? ((sid: string) => saveBidirToDeck(sid)), [onSave]);

  // Reload sliders whenever the slide (or refresh key) changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadImpl(slideId)
      .then((data: BidirSlider[]) => {
        if (cancelled) return;
        setSliders(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSliders([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slideId, refreshKey, loadImpl]);

  // Track resize so the marker positions stay accurate.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = (): void => setTrackWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sliders.length]);

  const handleAdjust = useCallback(
    async (slider: BidirSlider, value: number) => {
      const updated = await adjustImpl(slideId, slider.id, value, {
        type: 'presenter',
        id: 'presenter',
        name: 'Presenter',
      });
      setSliders((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      const adj: BidirAdjustment = {
        id: `adj_${Date.now().toString(36)}`,
        timestamp_ms: Date.now(),
        slider_id: slider.id,
        actor: { type: 'presenter', id: 'presenter', name: 'Presenter' },
        from_value: slider.presenter_value,
        to_value: updated.presenter_value,
        new_midpoint: updated.midpoint,
      };
      setLog((prev) => [...prev, adj]);
    },
    [adjustImpl, slideId],
  );

  const handleReset = useCallback(
    async (slider: BidirSlider, target: ResetTarget) => {
      const value = target === 'presenter' ? slider.audience_value : slider.presenter_value;
      const actor: BidirAdjustment['actor'] =
        target === 'presenter'
          ? { type: 'audience', id: 'presenter', name: 'Presenter' }
          : { type: 'presenter', id: 'presenter', name: 'Presenter' };
      const updated = await adjustImpl(slideId, slider.id, value, actor);
      setSliders((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      const adj: BidirAdjustment = {
        id: `adj_${Date.now().toString(36)}`,
        timestamp_ms: Date.now(),
        slider_id: slider.id,
        actor,
        from_value: target === 'presenter' ? slider.presenter_value : slider.audience_value,
        to_value: value,
        new_midpoint: updated.midpoint,
      };
      setLog((prev) => [...prev, adj]);
    },
    [adjustImpl, slideId],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const out = await saveImpl(slideId);
      setSavedAtMs(out.saved_at_ms);
    } finally {
      setSaving(false);
    }
  }, [saveImpl, slideId]);

  const logSource = adjustments ?? log;

  return (
    <section
      data-testid={dataTestId}
      data-slide-id={slideId}
      data-saved-at-ms={savedAtMs ?? ''}
      className="flex flex-col gap-4 rounded-md border border-slate-700/60 bg-slate-800/40 p-4"
    >
      <header className="flex items-center justify-between">
        <h2
          className="text-base font-semibold text-slate-100"
          data-testid={`${dataTestId}-heading`}
        >
          Two-way slides
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`${dataTestId}-save`}
            onClick={handleSave}
            disabled={saving}
            className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to deck'}
          </button>
          {savedAtMs !== null ? (
            <span data-testid={`${dataTestId}-saved`} className="text-[11px] text-emerald-400">
              Saved to deck.
            </span>
          ) : null}
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-slate-400" data-testid={`${dataTestId}-loading`}>
          Loading sliders…
        </p>
      ) : sliders.length === 0 ? (
        <p className="text-sm text-slate-400" data-testid={`${dataTestId}-empty`}>
          No bidirectional sliders on this slide.
        </p>
      ) : (
        <ul className="flex flex-col gap-5" data-testid={`${dataTestId}-list`}>
          {sliders.map((slider) => (
            <BidirSliderRow
              key={slider.id}
              slider={slider}
              trackRef={trackRef}
              trackWidth={trackWidth}
              onAdjust={(v) => handleAdjust(slider, v)}
              onReset={(target) => handleReset(slider, target)}
              testIdPrefix={`${dataTestId}-slider-${slider.id}`}
            />
          ))}
        </ul>
      )}

      <NegotiationLog adjustments={logSource} />
    </section>
  );
}

interface BidirSliderRowProps {
  readonly slider: BidirSlider;
  readonly trackRef: React.MutableRefObject<HTMLDivElement | null>;
  readonly trackWidth: number;
  readonly onAdjust: (value: number) => void;
  readonly onReset: (target: ResetTarget) => void;
  readonly testIdPrefix: string;
}

function BidirSliderRow({
  slider,
  trackRef,
  trackWidth,
  onAdjust,
  onReset,
  testIdPrefix,
}: BidirSliderRowProps): ReactElement {
  const [animatingFrom, setAnimatingFrom] = useState<{
    presenter: number;
    audience: number;
  } | null>(null);
  const presenterX = fractionToPx(slider.presenter_value, slider.min, slider.max, trackWidth);
  const audienceX = fractionToPx(slider.audience_value, slider.min, slider.max, trackWidth);
  const midpointX = fractionToPx(slider.midpoint, slider.min, slider.max, trackWidth);

  // When both sides have moved past their initial values, capture the
  // "before" frame so we can animate the markers toward the midpoint
  // for one frame. We intentionally depend on the slider values
  // rather than the derived pixel positions so the animation only
  // runs when the inputs change, not on every container resize.
  useEffect(() => {
    if (trackWidth === 0) return;
    setAnimatingFrom({ presenter: presenterX, audience: audienceX });
    const id = window.setTimeout(() => setAnimatingFrom(null), 400);
    return () => window.clearTimeout(id);
  }, [slider.presenter_value, slider.audience_value, trackWidth, presenterX, audienceX]);

  const marker: MarkerState = animatingFrom
    ? {
        presenterX: animatingFrom.presenter,
        audienceX: animatingFrom.audience,
        midpointX,
      }
    : { presenterX, audienceX, midpointX };

  const presenterDisplay = Math.round(slider.presenter_value);
  const audienceDisplay = Math.round(slider.audience_value);
  const midpointDisplay = Math.round(slider.midpoint);

  return (
    <li
      className="flex flex-col gap-2"
      data-testid={testIdPrefix}
      data-converged={slider.converged}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-sm font-semibold text-slate-100"
          data-testid={`${testIdPrefix}-label`}
        >
          {slider.label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          data-testid={`${testIdPrefix}-converged`}
          style={{
            background: slider.converged ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)',
            color: slider.converged ? '#34d399' : '#cbd5e1',
          }}
        >
          {slider.converged ? 'Converged' : 'Negotiating'}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-10 rounded-md bg-slate-900/70"
        data-testid={`${testIdPrefix}-track`}
        data-presenter-value={slider.presenter_value}
        data-audience-value={slider.audience_value}
        data-midpoint={slider.midpoint}
      >
        <div
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-700"
          style={{ left: 0, right: 0 }}
        />
        <div
          aria-hidden
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-500/70 transition-all duration-300"
          style={{
            left: Math.min(marker.presenterX, marker.audienceX),
            width: Math.abs(marker.audienceX - marker.presenterX),
          }}
          data-testid={`${testIdPrefix}-span`}
        />
        <div
          aria-hidden
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-emerald-300 transition-all duration-300"
          style={{ left: marker.midpointX }}
          data-testid={`${testIdPrefix}-midpoint-marker`}
        />
        <div
          aria-hidden
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300 bg-slate-900 transition-all duration-300"
          style={{ left: marker.presenterX }}
          data-testid={`${testIdPrefix}-presenter-marker`}
          title="Presenter value"
        />
        <div
          aria-hidden
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 bg-slate-900 transition-all duration-300"
          style={{ left: marker.audienceX }}
          data-testid={`${testIdPrefix}-audience-marker`}
          title="Audience value"
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-300">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Your value</span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={slider.presenter_value}
            onChange={(e) => onAdjust(Number(e.target.value))}
            data-testid={`${testIdPrefix}-presenter-input`}
            className="w-48 accent-sky-400"
            aria-label={`${slider.label} presenter value`}
          />
          <span className="tabular-nums" data-testid={`${testIdPrefix}-presenter-display`}>
            {presenterDisplay} {slider.unit}
          </span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Their value</span>
          <span className="tabular-nums" data-testid={`${testIdPrefix}-audience-display`}>
            {audienceDisplay} {slider.unit}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Midpoint</span>
          <span className="tabular-nums" data-testid={`${testIdPrefix}-midpoint-display`}>
            {midpointDisplay} {slider.unit}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            data-testid={`${testIdPrefix}-reset-yours`}
            onClick={() => onReset('presenter')}
            className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-100"
          >
            Reset to your value
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-reset-theirs`}
            onClick={() => onReset('audience')}
            className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-100"
          >
            Reset to their value
          </button>
        </div>
      </div>
    </li>
  );
}
