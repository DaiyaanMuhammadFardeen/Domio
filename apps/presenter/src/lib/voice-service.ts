/**
 * voice-service — types + persistence helpers for voice-triggered slide
 * states.
 *
 * Per Wave 11 §S11.5 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The presenter app captures the presenter's spoken phrases via the
 * browser's Web Speech API. This module is the persistence + audit
 * layer that:
 *
 *   • Stores the phrase registry (phrases → actions).
 *   • Matches a recognized phrase against the registry and produces a
 *     confidence score based on substring overlap.
 *   • Records every match for the audit log.
 *   • Falls back to in-memory state when localStorage is unavailable
 *     so the demo build runs offline.
 */

export type VoiceAction =
  | 'scenario_toggle'
  | 'slide_jump'
  | 'poll_launch'
  | 'goto_section'
  | 'mute';

export interface VoicePhrase {
  id: string;
  /** The literal phrase the presenter is expected to say. */
  phrase: string;
  /** What to do when the phrase matches. */
  action: VoiceAction;
  /** Identifier of the target (scenario id, slide id, section id, etc.). */
  target: string;
  /** 0..1 confidence threshold required for a match. */
  threshold: number;
  /** When false, the phrase is ignored by the matcher. */
  enabled: boolean;
}

export type VoiceMatchStatus = 'pending' | 'accepted' | 'rejected' | 'auto_dismissed';

export interface VoiceMatch {
  id: string;
  timestamp_ms: number;
  /** The raw phrase that was recognized (or the closest registry hit). */
  phrase: string;
  /** 0..1 confidence produced by the matcher. */
  confidence: number;
  action: VoiceAction;
  target: string;
  status: VoiceMatchStatus;
}

export interface VoiceServiceOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly storageKey?: string;
  /** Privacy acknowledgement key — separate so tests can reset independently. */
  readonly privacyStorageKey?: string;
}

const DEFAULT_PHRASE_STORAGE_KEY = 'domio.presenter.voice.registry.v1';
const DEFAULT_MATCH_STORAGE_KEY = 'domio.presenter.voice.matches.v1';
const DEFAULT_PRIVACY_KEY = 'domio.presenter.voice.privacy.acknowledged.v1';

/**
 * Default phrases registered out of the box. These match the spec's
 * example utterances:
 *
 *   - "let's look at the bear case"  → scenario_toggle + "bear-case"
 *   - "jump to q3 results"           → goto_section  + "q3"
 *   - "start a poll"                 → poll_launch   + ""
 */
export const DEFAULT_VOICE_PHRASES: ReadonlyArray<VoicePhrase> = [
  {
    id: 'vp_default_bear_case',
    phrase: "let's look at the bear case",
    action: 'scenario_toggle',
    target: 'bear-case',
    threshold: 0.5,
    enabled: true,
  },
  {
    id: 'vp_default_q3_results',
    phrase: 'jump to q3 results',
    action: 'goto_section',
    target: 'q3',
    threshold: 0.5,
    enabled: true,
  },
  {
    id: 'vp_default_poll',
    phrase: 'start a poll',
    action: 'poll_launch',
    target: '',
    threshold: 0.5,
    enabled: true,
  },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeReadArray(key: string): unknown[] | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — silently degrade */
  }
}

/** In-memory mirror so the demo build works without localStorage. */
const inMemoryPhrases: VoicePhrase[] = DEFAULT_VOICE_PHRASES.map((p) => ({ ...p }));
const inMemoryMatches: VoiceMatch[] = [];

function loadPhrases(storageKey: string): VoicePhrase[] {
  const stored = safeReadArray(storageKey);
  if (!stored) return inMemoryPhrases.slice();
  return stored
    .filter((item): item is VoicePhrase => isValidPhrase(item))
    .map((p) => ({ ...p }));
}

function persistPhrases(storageKey: string, phrases: VoicePhrase[]): void {
  safeWrite(storageKey, phrases);
}

function loadMatches(storageKey: string): VoiceMatch[] {
  const stored = safeReadArray(storageKey);
  if (!stored) return inMemoryMatches.slice();
  return stored
    .filter((item): item is VoiceMatch => isValidMatch(item))
    .map((m) => ({ ...m }));
}

function persistMatches(storageKey: string, matches: VoiceMatch[]): void {
  safeWrite(storageKey, matches);
}

function isValidPhrase(value: unknown): value is VoicePhrase {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.phrase === 'string' &&
    typeof v.action === 'string' &&
    typeof v.target === 'string' &&
    typeof v.threshold === 'number' &&
    typeof v.enabled === 'boolean'
  );
}

function isValidMatch(value: unknown): value is VoiceMatch {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.timestamp_ms === 'number' &&
    typeof v.phrase === 'string' &&
    typeof v.confidence === 'number' &&
    typeof v.action === 'string' &&
    typeof v.target === 'string' &&
    typeof v.status === 'string'
  );
}

/**
 * Tokenize a phrase for matching. We strip punctuation, lowercase, and
 * collapse whitespace so noisy STT output still scores well.
 *
 * Apostrophes are removed without inserting whitespace so contractions
 * like "let's" stay a single token ("lets" after lowercasing).
 */
function normalize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Score a recognized utterance against a registered phrase by computing
 * the fraction of registered tokens that appear in the utterance.
 * Returns 0..1.
 */
export function scoreMatch(utterance: string, phrase: string): number {
  const utt = normalize(utterance);
  const phr = normalize(phrase);
  if (phr.length === 0) return 0;
  if (utt.length === 0) return 0;
  let hits = 0;
  for (const tok of phr) {
    if (utt.includes(tok)) hits++;
  }
  return hits / phr.length;
}

/**
 * Look up the best matching phrase for an utterance. Returns null when
 * no enabled phrase exceeds its threshold.
 */
export function findBestMatch(
  utterance: string,
  phrases: ReadonlyArray<VoicePhrase>,
): { phrase: VoicePhrase; confidence: number } | null {
  let best: { phrase: VoicePhrase; confidence: number } | null = null;
  for (const phrase of phrases) {
    if (!phrase.enabled) continue;
    const confidence = scoreMatch(utterance, phrase.phrase);
    if (confidence < phrase.threshold) continue;
    if (!best || confidence > best.confidence) {
      best = { phrase, confidence };
    }
  }
  return best;
}

/**
 * Fetch the registered phrases. On a fresh device the default phrases
 * are returned and persisted.
 */
export async function listVoicePhrases(
  opts: VoiceServiceOptions = {},
): Promise<VoicePhrase[]> {
  const key = opts.storageKey ?? DEFAULT_PHRASE_STORAGE_KEY;
  const phrases = loadPhrases(key);
  if (phrases.length === 0) {
    // Bootstrap with defaults so the presenter has something to say.
    const defaults = DEFAULT_VOICE_PHRASES.map((p) => ({ ...p }));
    persistPhrases(key, defaults);
    return defaults;
  }
  return phrases;
}

/**
 * Persist the phrase registry. Returns the canonical list (cloned).
 */
export async function savePhraseRegistry(
  phrases: ReadonlyArray<VoicePhrase>,
  opts: VoiceServiceOptions = {},
): Promise<VoicePhrase[]> {
  const key = opts.storageKey ?? DEFAULT_PHRASE_STORAGE_KEY;
  const canonical = phrases.map((p) => ({
    id: p.id || makeId('vp'),
    phrase: p.phrase,
    action: p.action,
    target: p.target,
    threshold: clamp01(p.threshold),
    enabled: p.enabled,
  }));
  persistPhrases(key, canonical);
  // Mirror to in-memory store so the demo build keeps working.
  inMemoryPhrases.length = 0;
  for (const p of canonical) inMemoryPhrases.push({ ...p });
  return canonical;
}

/**
 * Record a voice match for the audit log. Every match — accepted,
 * rejected, pending, or auto-dismissed — is captured.
 */
export async function recordVoiceMatch(
  match: VoiceMatch,
  opts: VoiceServiceOptions = {},
): Promise<void> {
  const key = opts.storageKey ?? DEFAULT_MATCH_STORAGE_KEY;
  const stored = loadMatches(key);
  const next = [...stored, { ...match }];
  persistMatches(key, next);
  inMemoryMatches.push({ ...match });
}

/**
 * List voice matches for a session. Optionally filter by timestamp.
 */
export async function listVoiceMatches(
  _sessionId: string,
  sinceMs?: number,
  opts: VoiceServiceOptions = {},
): Promise<VoiceMatch[]> {
  const key = opts.storageKey ?? DEFAULT_MATCH_STORAGE_KEY;
  const stored = loadMatches(key);
  if (typeof sinceMs !== 'number') return stored;
  return stored.filter((m) => m.timestamp_ms >= sinceMs);
}

/**
 * Update the status of an existing match (e.g. accepted / rejected).
 */
export async function updateVoiceMatchStatus(
  id: string,
  status: VoiceMatchStatus,
  opts: VoiceServiceOptions = {},
): Promise<void> {
  const key = opts.storageKey ?? DEFAULT_MATCH_STORAGE_KEY;
  const stored = loadMatches(key);
  const next = stored.map((m) => (m.id === id ? { ...m, status } : m));
  persistMatches(key, next);
  const inMem = inMemoryMatches.findIndex((m) => m.id === id);
  if (inMem >= 0) inMemoryMatches[inMem] = { ...inMemoryMatches[inMem]!, status };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Privacy acknowledgement — first time the voice listener is enabled
 * the presenter must confirm a privacy notice. Persist once they've
 * confirmed so we don't nag on every session.
 */
const inMemoryPrivacy: Set<string> = new Set();

export async function hasAcknowledgedPrivacy(
  opts: VoiceServiceOptions = {},
): Promise<boolean> {
  const key = opts.privacyStorageKey ?? DEFAULT_PRIVACY_KEY;
  if (inMemoryPrivacy.has(key)) return true;
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export async function acknowledgePrivacy(
  opts: VoiceServiceOptions = {},
): Promise<void> {
  const key = opts.privacyStorageKey ?? DEFAULT_PRIVACY_KEY;
  inMemoryPrivacy.add(key);
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Build a new VoiceMatch descriptor for a raw recognition result.
 * Convenience helper for callers that don't want to remember the
 * status default.
 */
export function buildVoiceMatch(args: {
  phrase: string;
  confidence: number;
  action: VoiceAction;
  target: string;
  status?: VoiceMatchStatus;
  timestamp_ms?: number;
}): VoiceMatch {
  return {
    id: makeId('vm'),
    timestamp_ms: args.timestamp_ms ?? Date.now(),
    phrase: args.phrase,
    confidence: args.confidence,
    action: args.action,
    target: args.target,
    status: args.status ?? 'pending',
  };
}

/**
 * Test-only helper. Resets the in-memory state and clears localStorage
 * keys so each test starts clean.
 */
export function __resetVoiceServiceState(opts: VoiceServiceOptions = {}): void {
  const pKey = opts.storageKey ?? DEFAULT_PHRASE_STORAGE_KEY;
  const mKey = opts.storageKey ?? DEFAULT_MATCH_STORAGE_KEY;
  const privKey = opts.privacyStorageKey ?? DEFAULT_PRIVACY_KEY;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(pKey);
      window.localStorage.removeItem(mKey);
      window.localStorage.removeItem(privKey);
    } catch {
      /* ignore */
    }
  }
  inMemoryPhrases.length = 0;
  for (const p of DEFAULT_VOICE_PHRASES) inMemoryPhrases.push({ ...p });
  inMemoryMatches.length = 0;
}

/**
 * Test-only helper for inspecting the in-memory phrase store.
 */
export function __peekVoicePhrases(): ReadonlyArray<VoicePhrase> {
  return inMemoryPhrases.slice();
}
