/**
 * two-way-service — types + functions for the audience-side two-way
 * slider.
 *
 * Per Wave 11 §S11.7 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * This is a local-only mirror of `apps/presenter/src/lib/two-way-service.ts`.
 * The presenter app owns the canonical state; on the audience side we
 * keep a local copy so the slider is responsive even when the network
 * is slow or unavailable. Network paths degrade gracefully.
 */

export interface BidirSlider {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  /** Presenter's current value (what the audience sees). */
  readonly presenter_value: number;
  /** Audience-side value (what the participant just moved). */
  readonly audience_value: number;
  readonly midpoint: number;
  readonly converged: boolean;
}

export interface BidirActor {
  readonly type: 'presenter' | 'audience';
  readonly id: string;
  readonly name: string;
}

export interface BidirAdjustment {
  readonly id: string;
  readonly timestamp_ms: number;
  readonly slider_id: string;
  readonly actor: BidirActor;
  readonly from_value: number;
  readonly to_value: number;
  readonly new_midpoint: number;
}

export interface BidirSaveResult {
  readonly saved_at_ms: number;
}

export class BidirServiceError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'BidirServiceError';
  }
}

export interface BidirServiceOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export function computeMidpoint(a: number, b: number): number {
  return (a + b) / 2;
}

export function isConverged(a: number, b: number, step: number): boolean {
  return Math.abs(a - b) <= Math.max(step, step / 2);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const stepped = Math.round(value / step) * step;
  return Number.isInteger(step) ? Math.trunc(stepped) : stepped;
}

function recompute(slider: BidirSlider): BidirSlider {
  const midpoint = computeMidpoint(slider.presenter_value, slider.audience_value);
  return {
    ...slider,
    midpoint,
    converged: isConverged(slider.presenter_value, slider.audience_value, slider.step),
  };
}

function buildSeedSliders(slideId: string): BidirSlider[] {
  let seed = 0;
  for (let i = 0; i < slideId.length; i++) {
    seed = (seed * 31 + slideId.charCodeAt(i)) | 0;
  }
  const priceMid = 49 + (Math.abs(seed) % 20);
  const seatsMid = 25 + (Math.abs(seed >> 3) % 50);
  return [
    {
      id: `${slideId}__price`,
      label: 'Price point',
      min: 0,
      max: 199,
      step: 1,
      unit: '$/mo',
      presenter_value: priceMid,
      audience_value: priceMid,
      midpoint: priceMid,
      converged: true,
    },
    {
      id: `${slideId}__seats`,
      label: 'Seats',
      min: 1,
      max: 200,
      step: 1,
      unit: 'users',
      presenter_value: seatsMid,
      audience_value: seatsMid,
      midpoint: seatsMid,
      converged: true,
    },
  ];
}

let store: Map<string, {
  sliders: BidirSlider[];
  adjustments: BidirAdjustment[];
  savedAtMs: number | null;
}> = new Map();

function ensureSlide(slideId: string): {
  sliders: BidirSlider[];
  adjustments: BidirAdjustment[];
  savedAtMs: number | null;
} {
  let entry = store.get(slideId);
  if (!entry) {
    entry = {
      sliders: buildSeedSliders(slideId),
      adjustments: [],
      savedAtMs: null,
    };
    store.set(slideId, entry);
  }
  return entry;
}

function makeAdjustmentId(): string {
  return `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * List the bidir sliders for a slide. Falls back to the deterministic
 * seed when no remote state has loaded yet.
 */
export async function listBidirSliders(slideId: string): Promise<BidirSlider[]> {
  const entry = ensureSlide(slideId);
  return entry.sliders.map((s) => ({ ...s }));
}

/**
 * Move the audience-side of a slider. The midpoint is recomputed
 * locally so the UI can render the convergence instantly; the
 * presenter side receives the value through the engine in production.
 */
export async function adjustBidirSlider(
  slideId: string,
  sliderId: string,
  value: number,
  actor: BidirActor = { type: 'audience', id: 'me', name: 'You' },
): Promise<BidirSlider> {
  const entry = ensureSlide(slideId);
  const idx = entry.sliders.findIndex((s) => s.id === sliderId);
  if (idx < 0) {
    throw new BidirServiceError(404, `slider ${sliderId} not found on slide ${slideId}`);
  }
  const existing = entry.sliders[idx]!;
  const rounded = roundToStep(clamp(value, existing.min, existing.max), existing.step);
  const updated = recompute({ ...existing, audience_value: rounded });
  entry.sliders[idx] = updated;

  const adjustment: BidirAdjustment = {
    id: makeAdjustmentId(),
    timestamp_ms: Date.now(),
    slider_id: sliderId,
    actor,
    from_value: existing.audience_value,
    to_value: rounded,
    new_midpoint: updated.midpoint,
  };
  entry.adjustments.push(adjustment);
  return { ...updated };
}

/**
 * Update the presenter-side from the engine bus. Audience-side state is
 * unchanged; only the midpoint + convergence flag move.
 */
export async function syncPresenterValue(
  slideId: string,
  sliderId: string,
  presenterValue: number,
): Promise<BidirSlider> {
  const entry = ensureSlide(slideId);
  const idx = entry.sliders.findIndex((s) => s.id === sliderId);
  if (idx < 0) {
    throw new BidirServiceError(404, `slider ${sliderId} not found on slide ${slideId}`);
  }
  const existing = entry.sliders[idx]!;
  const rounded = roundToStep(clamp(presenterValue, existing.min, existing.max), existing.step);
  const updated = recompute({ ...existing, presenter_value: rounded });
  entry.sliders[idx] = updated;
  return { ...updated };
}

export async function listBidirAdjustments(slideId: string): Promise<BidirAdjustment[]> {
  const entry = ensureSlide(slideId);
  return entry.adjustments.slice();
}

export async function saveBidirToDeck(slideId: string): Promise<BidirSaveResult> {
  const entry = ensureSlide(slideId);
  const ts = Date.now();
  entry.savedAtMs = ts;
  return { saved_at_ms: ts };
}

export function __resetBidirServiceState(opts: { slideId?: string } = {}): void {
  if (opts.slideId) {
    store.delete(opts.slideId);
  } else {
    store = new Map();
  }
}

export function __seedBidirSliders(slideId: string, sliders: ReadonlyArray<BidirSlider>): void {
  store.set(slideId, {
    sliders: sliders.map((s) => recompute(s)),
    adjustments: [],
    savedAtMs: null,
  });
}