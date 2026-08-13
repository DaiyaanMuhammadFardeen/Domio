/**
 * apps/presenter — Haptics service.
 *
 * Per Wave 11 §S11.13 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Phone remote vibration patterns + pacing checkpoints. The phone remote
 * vibrates on slide advance and (optionally) at pre-configured pacing
 * checkpoints within a slide ("wrap up at 30s", "demo break at 60s").
 *
 * The service provides:
 *   • Saved vibration patterns (named lists of {vibrate_ms, pause_ms}
 *     pulses). Built-in presets: short / medium / long; users can also
 *     save custom patterns.
 *   • Pacing checkpoints per (deckId, slideId): each checkpoint triggers
 *     a saved pattern when the presenter has been on a slide for N
 *     seconds.
 *   • A `triggerVibrate` helper that flattens a pattern into the array
 *     shape `navigator.vibrate` expects, gracefully degrading when the
 *     Vibration API is unavailable.
 *
 * All persistence is in-memory for the demo build; the real backend
 * would back these with persisted storage and per-device sync.
 */

export interface VibrationPulse {
  /** Milliseconds of vibration. */
  readonly vibrate_ms: number;
  /** Milliseconds of pause after the pulse. */
  readonly pause_ms: number;
}

export interface VibrationPattern {
  id: string;
  name: string;
  pulses: ReadonlyArray<VibrationPulse>;
}

export interface PacingCheckpoint {
  id: string;
  /** Deck this checkpoint belongs to. */
  deck_id: string;
  /** Slide within the deck. */
  slide_id: string;
  /** Offset from slide start, in seconds. */
  time_offset_sec: number;
  /** Free-text label, e.g. "30s — wrap up". */
  label: string;
  /** Pattern to fire when the checkpoint trips. */
  pattern_id: string;
}

/* ----------------------------- built-in presets ----------------------------- */

export const SHORT_PATTERN: VibrationPattern = {
  id: 'preset.short',
  name: 'Short',
  pulses: [{ vibrate_ms: 30, pause_ms: 0 }],
};

export const MEDIUM_PATTERN: VibrationPattern = {
  id: 'preset.medium',
  name: 'Medium',
  pulses: [
    { vibrate_ms: 50, pause_ms: 30 },
    { vibrate_ms: 50, pause_ms: 0 },
  ],
};

export const LONG_PATTERN: VibrationPattern = {
  id: 'preset.long',
  name: 'Long',
  pulses: [
    { vibrate_ms: 80, pause_ms: 30 },
    { vibrate_ms: 80, pause_ms: 30 },
    { vibrate_ms: 80, pause_ms: 0 },
  ],
};

export const BUILTIN_PATTERNS: ReadonlyArray<VibrationPattern> = [
  SHORT_PATTERN,
  MEDIUM_PATTERN,
  LONG_PATTERN,
];

export const PRESET_PATTERN_IDS: ReadonlyArray<string> = BUILTIN_PATTERNS.map(
  (p) => p.id,
);

/* ------------------------------- in-memory store ---------------------------- */

interface Store {
  patterns: Map<string, VibrationPattern>;
  checkpoints: Map<string, PacingCheckpoint[]>; // keyed by deck_id
  nextId: number;
}

const globalAny = globalThis as { __domioHapticsStore?: Store };

function getStore(): Store {
  if (!globalAny.__domioHapticsStore) {
    const patterns = new Map<string, VibrationPattern>();
    for (const p of BUILTIN_PATTERNS) patterns.set(p.id, p);
    globalAny.__domioHapticsStore = {
      patterns,
      checkpoints: new Map(),
      nextId: 1,
    };
  }
  return globalAny.__domioHapticsStore;
}

function nextId(prefix: string): string {
  const store = getStore();
  const id = store.nextId++;
  return `${prefix}_${id.toString(36)}`;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function coercePulse(input: Readonly<Partial<VibrationPulse>>): VibrationPulse {
  return {
    vibrate_ms: isFiniteNonNegative(input.vibrate_ms) ? Math.round(input.vibrate_ms) : 0,
    pause_ms: isFiniteNonNegative(input.pause_ms) ? Math.round(input.pause_ms) : 0,
  };
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value;
}

const MAX_LABEL_LENGTH = 120;
const MAX_PATTERN_NAME_LENGTH = 80;

function clampLabel(value: string): string {
  return value.slice(0, MAX_LABEL_LENGTH);
}

function clampName(value: string): string {
  return value.slice(0, MAX_PATTERN_NAME_LENGTH);
}

/* ------------------------------ public API ---------------------------------- */

/** List all saved patterns (built-in presets + custom user patterns). */
export async function listPatterns(): Promise<VibrationPattern[]> {
  const store = getStore();
  return Array.from(store.patterns.values()).map((p) => ({
    id: p.id,
    name: p.name,
    pulses: p.pulses.map((pulse) => ({ ...pulse })),
  }));
}

/** Save (insert or update) a pattern. Returns the canonical record. */
export async function savePattern(pattern: VibrationPattern): Promise<VibrationPattern> {
  const store = getStore();
  const normalized: VibrationPattern = {
    id: typeof pattern.id === 'string' && pattern.id.length > 0 ? pattern.id : nextId('pat'),
    name: clampName(pattern.name ?? 'Untitled pattern'),
    pulses: (pattern.pulses ?? []).map((p) => coercePulse(p)),
  };
  store.patterns.set(normalized.id, normalized);
  return {
    id: normalized.id,
    name: normalized.name,
    pulses: normalized.pulses.map((p) => ({ ...p })),
  };
}

/** Delete a pattern by id. Built-in presets are preserved. */
export async function deletePattern(id: string): Promise<void> {
  if (PRESET_PATTERN_IDS.includes(id)) return;
  const store = getStore();
  store.patterns.delete(id);
}

/** Fetch a pattern by id; returns null when not found. */
export async function getPattern(id: string): Promise<VibrationPattern | null> {
  const store = getStore();
  const found = store.patterns.get(id);
  if (!found) return null;
  return {
    id: found.id,
    name: found.name,
    pulses: found.pulses.map((p) => ({ ...p })),
  };
}

/** List pacing checkpoints for a deck, regardless of which slide. */
export async function listPacingCheckpoints(deckId: string): Promise<PacingCheckpoint[]> {
  const store = getStore();
  const list = store.checkpoints.get(deckId) ?? [];
  return list.map((c) => ({
    id: c.id,
    deck_id: c.deck_id,
    slide_id: c.slide_id,
    time_offset_sec: c.time_offset_sec,
    label: c.label,
    pattern_id: c.pattern_id,
  }));
}

/**
 * Persist the full set of pacing checkpoints for a deck. The provided
 * list replaces any existing checkpoints for the deck. Items are
 * normalized (id assigned if missing, offsets clamped, labels trimmed).
 */
export async function savePacingCheckpoints(
  checkpoints: ReadonlyArray<PacingCheckpoint>,
): Promise<PacingCheckpoint[]> {
  const store = getStore();
  const byDeck = new Map<string, PacingCheckpoint[]>();
  const result: PacingCheckpoint[] = [];
  for (const raw of checkpoints) {
    const deckId = typeof raw.deck_id === 'string' ? raw.deck_id : '';
    const slideId = typeof raw.slide_id === 'string' ? raw.slide_id : '';
    if (!deckId || !slideId) continue;
    const cp: PacingCheckpoint = {
      id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : nextId('pc'),
      deck_id: deckId,
      slide_id: slideId,
      time_offset_sec: clampOffset(raw.time_offset_sec),
      label: clampLabel(raw.label ?? ''),
      pattern_id: typeof raw.pattern_id === 'string' ? raw.pattern_id : SHORT_PATTERN.id,
    };
    result.push(cp);
    const arr = byDeck.get(deckId) ?? [];
    arr.push(cp);
    byDeck.set(deckId, arr);
  }
  // Replace every deck mentioned in the call. Other decks are untouched.
  for (const [deckId, list] of byDeck.entries()) {
    store.checkpoints.set(deckId, list);
  }
  return result;
}

/** Flatten a VibrationPattern into the array shape `navigator.vibrate`
 *  expects. Each pulse becomes [vibrate_ms, pause_ms] in sequence. */
export function patternToVibrateSequence(
  pattern: Readonly<VibrationPattern>,
): number[] {
  const seq: number[] = [];
  for (const pulse of pattern.pulses) {
    seq.push(Math.max(0, pulse.vibrate_ms));
    if (pulse.pause_ms > 0) seq.push(Math.max(0, pulse.pause_ms));
  }
  return seq;
}

/**
 * Trigger a vibration pattern. Returns true if the Vibration API was
 * present and the call succeeded, false otherwise. Best-effort — never
 * throws. Use this for both slide-advance feedback and pacing
 * checkpoints.
 */
export function triggerVibrate(pattern: Readonly<VibrationPattern>): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.vibrate !== 'function') return false;
  const sequence = patternToVibrateSequence(pattern);
  if (sequence.length === 0) return false;
  try {
    return navigator.vibrate(sequence);
  } catch {
    return false;
  }
}

/** Trigger a quick advance pulse. Convenience for "fire on slide
 *  advance" — uses the short preset unless a pattern is provided. */
export function triggerAdvanceVibrate(
  pattern: Readonly<VibrationPattern> = SHORT_PATTERN,
): boolean {
  return triggerVibrate(pattern);
}

/** Build a blank user pattern. Useful for the editor's "Add pattern"
 *  action. */
export function blankPattern(name = 'New pattern'): VibrationPattern {
  return {
    id: nextId('pat'),
    name,
    pulses: [{ vibrate_ms: 40, pause_ms: 0 }],
  };
}

/** Build a blank pacing checkpoint for a slide. */
export function blankCheckpoint(
  deckId: string,
  slideId: string,
): PacingCheckpoint {
  return {
    id: nextId('pc'),
    deck_id: deckId,
    slide_id: slideId,
    time_offset_sec: 30,
    label: '30s — wrap up',
    pattern_id: MEDIUM_PATTERN.id,
  };
}

/** Test helper — clear every pattern (except built-ins) and checkpoint. */
export function __resetHapticsServiceState(): void {
  const store = getStore();
  store.patterns.clear();
  for (const p of BUILTIN_PATTERNS) store.patterns.set(p.id, p);
  store.checkpoints.clear();
  store.nextId = 1;
}
