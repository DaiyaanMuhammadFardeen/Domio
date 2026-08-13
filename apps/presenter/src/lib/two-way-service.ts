/**
 * two-way-service — types + functions for two-way bidir sliders.
 *
 * Per Wave 11 §S11.7 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * A pricing slide has bidirectional sliders. The presenter and the
 * audience can each move "their side" of the slider, and the system
 * records the adjustments + computes a midpoint (the "negotiated"
 * value). Every adjustment is logged so we can show a timeline of who
 * moved what and when; final values can be saved to the deck.
 *
 * This module is the presenter-side persistence layer. It talks to
 * `/v1/presenter/sessions/{sid}/slides/{slideId}/bidir` in the future;
 * today everything falls back to deterministic in-memory seed data so
 * the demo runs without a backend.
 */

export interface BidirSlider {
  /** Stable id within a slide. */
  readonly id: string;
  /** Display label, e.g. "Price point". */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Display unit, e.g. "$/mo", "users". */
  readonly unit: string;
  /** Current presenter-side value. */
  readonly presenter_value: number;
  /** Current audience-side value. */
  readonly audience_value: number;
  /** Negotiated midpoint of presenter_value and audience_value. */
  readonly midpoint: number;
  /** True once presenter_value === audience_value (within step). */
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
  /** Midpoint after the adjustment was applied. */
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
  /** Override the in-memory seed (used by tests). */
  readonly initialSliders?: ReadonlyArray<BidirSlider>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const stepped = Math.round(value / step) * step;
  // Snap to integer when step is an integer to keep deterministic output.
  return Number.isInteger(step) ? Math.trunc(stepped) : stepped;
}

export function computeMidpoint(a: number, b: number): number {
  return (a + b) / 2;
}

export function isConverged(a: number, b: number, step: number): boolean {
  return Math.abs(a - b) <= Math.max(step, step / 2);
}

function buildSeedSliders(slideId: string): BidirSlider[] {
  // Deterministic seed derived from the slide id so re-renders are stable.
  let seed = 0;
  for (let i = 0; i < slideId.length; i++) {
    seed = (seed * 31 + slideId.charCodeAt(i)) | 0;
  }
  const priceMid = 49 + (Math.abs(seed) % 20); // 49..68
  const seatsMid = 25 + (Math.abs(seed >> 3) % 50); // 25..74
  return [
    {
      id: `${slideId}__price`,
      label: 'Price point',
      min: 0,
      max: 199,
      step: 1,
      unit: '$/mo',
      presenter_value: priceMid,
      audience_value: priceMid + 10,
      midpoint: computeMidpoint(priceMid, priceMid + 10),
      converged: false,
    },
    {
      id: `${slideId}__seats`,
      label: 'Seats',
      min: 1,
      max: 200,
      step: 1,
      unit: 'users',
      presenter_value: seatsMid,
      audience_value: seatsMid - 5,
      midpoint: computeMidpoint(seatsMid, seatsMid - 5),
      converged: false,
    },
  ];
}

// Module-local in-memory state. Tests can reset via __resetBidirServiceState.
let store: Map<
  string,
  { sliders: BidirSlider[]; adjustments: BidirAdjustment[]; savedAtMs: number | null }
> = new Map();

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

function recompute(slider: BidirSlider): BidirSlider {
  const midpoint = computeMidpoint(slider.presenter_value, slider.audience_value);
  return {
    ...slider,
    midpoint,
    converged: isConverged(slider.presenter_value, slider.audience_value, slider.step),
  };
}

function makeAdjustmentId(): string {
  return `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * List every bidirectional slider on a slide. Falls back to the
 * deterministic seed if no override or remote data is available.
 */
export async function listBidirSliders(slideId: string): Promise<BidirSlider[]> {
  const entry = ensureSlide(slideId);
  return entry.sliders.map((s) => ({ ...s }));
}

/**
 * Adjust one side of a slider (presenter or audience). Returns the
 * updated slider after recomputing the midpoint and convergence flag.
 */
export async function adjustBidirSlider(
  slideId: string,
  sliderId: string,
  value: number,
  actor: BidirActor = {
    type: 'presenter',
    id: 'presenter',
    name: 'Presenter',
  },
): Promise<BidirSlider> {
  const entry = ensureSlide(slideId);
  const idx = entry.sliders.findIndex((s) => s.id === sliderId);
  if (idx < 0) {
    throw new BidirServiceError(404, `slider ${sliderId} not found on slide ${slideId}`);
  }
  const existing = entry.sliders[idx]!;
  const rounded = roundToStep(clamp(value, existing.min, existing.max), existing.step);
  const fromValue = actor.type === 'presenter' ? existing.presenter_value : existing.audience_value;
  const updated: BidirSlider = recompute({
    ...existing,
    ...(actor.type === 'presenter' ? { presenter_value: rounded } : { audience_value: rounded }),
  });
  entry.sliders[idx] = updated;

  const adjustment: BidirAdjustment = {
    id: makeAdjustmentId(),
    timestamp_ms: Date.now(),
    slider_id: sliderId,
    actor,
    from_value: fromValue,
    to_value: rounded,
    new_midpoint: updated.midpoint,
  };
  entry.adjustments.push(adjustment);
  return { ...updated };
}

/**
 * List the timeline of every adjustment made on a slide, oldest first.
 */
export async function listBidirAdjustments(slideId: string): Promise<BidirAdjustment[]> {
  const entry = ensureSlide(slideId);
  return entry.adjustments.slice();
}

/**
 * Save the current values of every bidir slider back to the deck.
 * Returns the timestamp the save was committed at.
 */
export async function saveBidirToDeck(slideId: string): Promise<BidirSaveResult> {
  const entry = ensureSlide(slideId);
  const ts = Date.now();
  entry.savedAtMs = ts;
  return { saved_at_ms: ts };
}

/**
 * Test/demo helper. Clears the in-memory state for a slide.
 */
export function __resetBidirServiceState(opts: { slideId?: string } = {}): void {
  if (opts.slideId) {
    store.delete(opts.slideId);
  } else {
    store = new Map();
  }
}

/**
 * Test/demo helper. Inject slider state directly (replaces the seed).
 */
export function __seedBidirSliders(slideId: string, sliders: ReadonlyArray<BidirSlider>): void {
  store.set(slideId, {
    sliders: sliders.map((s) => recompute(s)),
    adjustments: [],
    savedAtMs: null,
  });
}
