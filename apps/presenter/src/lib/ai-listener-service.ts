/**
 * apps/presenter — AI meeting listener service.
 *
 * Per Wave 11 §S11.10 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The listener registers question patterns (e.g. "what about churn?") and
 * surfaces the matching slide whenever a presenter's transcript matches one
 * of those patterns. Audio is captured entirely in the browser; this service
 * only knows about patterns and recorded matches.
 *
 * Today: in-memory patterns + per-session match log. The presenter-service
 * client will replace this in a later wave.
 */

export interface QuestionPattern {
  id: string;
  pattern: string;
  slide_id: string;
  relevance: number;
  enabled: boolean;
}

export interface MatchedQuestion {
  id: string;
  timestamp_ms: number;
  question: string;
  matched_pattern_id: string;
  slide_id: string;
  slide_title: string;
  relevance: number;
  status: 'pending' | 'accepted' | 'dismissed';
}

export const DEFAULT_QUESTION_PATTERNS: ReadonlyArray<QuestionPattern> = [
  {
    id: 'pat-churn',
    pattern: 'what about churn?',
    slide_id: 'churn-deck',
    relevance: 0.92,
    enabled: true,
  },
  {
    id: 'pat-revenue',
    pattern: 'show me the revenue',
    slide_id: 'revenue-q3',
    relevance: 0.88,
    enabled: true,
  },
  {
    id: 'pat-retention',
    pattern: 'how about retention?',
    slide_id: 'retention-funnel',
    relevance: 0.9,
    enabled: true,
  },
  {
    id: 'pat-qoq',
    pattern: 'compare to last quarter',
    slide_id: 'q3-vs-q2',
    relevance: 0.85,
    enabled: true,
  },
];

const DEFAULT_SLIDE_TITLES: Readonly<Record<string, string>> = {
  'churn-deck': 'Churn deep dive',
  'revenue-q3': 'Revenue (Q3)',
  'retention-funnel': 'Retention funnel',
  'q3-vs-q2': 'Q3 vs Q2 comparison',
};

let patterns: QuestionPattern[] = DEFAULT_QUESTION_PATTERNS.map((p) => ({ ...p }));
const matchesBySession = new Map<string, MatchedQuestion[]>();

/**
 * List all registered question patterns. Returns a defensive copy so the
 * caller can mutate freely without touching internal state.
 */
export async function listQuestionPatterns(): Promise<QuestionPattern[]> {
  return patterns.map((p) => ({ ...p }));
}

/**
 * Persist the supplied patterns. The entire list is replaced; missing
 * patterns are removed. Returns the newly stored list.
 */
export async function saveQuestionPatterns(next: QuestionPattern[]): Promise<QuestionPattern[]> {
  patterns = next.map((p) => ({ ...p }));
  return patterns.map((p) => ({ ...p }));
}

/**
 * Replace a single pattern's enabled flag in the in-memory store.
 */
export async function setPatternEnabled(
  id: string,
  enabled: boolean,
): Promise<QuestionPattern | null> {
  const idx = patterns.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated: QuestionPattern = { ...patterns[idx]!, enabled };
  patterns = [...patterns.slice(0, idx), updated, ...patterns.slice(idx + 1)];
  return { ...updated };
}

/**
 * Resolve a slide id to a human-friendly title. Falls back to the slide id
 * itself when we don't have a mapping.
 */
export function resolveSlideTitle(slideId: string): string {
  return DEFAULT_SLIDE_TITLES[slideId] ?? slideId;
}

/**
 * Record a single match against the default session bucket. The status
 * defaults to 'pending' — the presenter accepts or dismisses it from the UI.
 */
export async function recordMatchedQuestion(match: MatchedQuestion): Promise<void> {
  const list = matchesBySession.get('__default') ?? [];
  list.push({ ...match });
  matchesBySession.set('__default', list);
}

/**
 * Record a match scoped to a particular session id.
 */
export async function recordMatchedQuestionForSession(
  sessionId: string,
  match: MatchedQuestion,
): Promise<void> {
  const list = matchesBySession.get(sessionId) ?? [];
  list.push({ ...match });
  matchesBySession.set(sessionId, list);
}

/**
 * List all matches captured for the supplied session, in insertion order.
 */
export async function listMatchedQuestions(sessionId: string): Promise<MatchedQuestion[]> {
  const list = matchesBySession.get(sessionId) ?? [];
  return list.map((m) => ({ ...m }));
}

/**
 * Update the status of a previously recorded match. Returns the updated
 * record, or null when no match with the supplied id exists.
 */
export async function updateMatchStatus(
  sessionId: string,
  matchId: string,
  status: MatchedQuestion['status'],
): Promise<MatchedQuestion | null> {
  const list = matchesBySession.get(sessionId);
  if (!list) return null;
  const idx = list.findIndex((m) => m.id === matchId);
  if (idx === -1) return null;
  const updated: MatchedQuestion = { ...list[idx]!, status };
  const next = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
  matchesBySession.set(sessionId, next);
  return { ...updated };
}

/**
 * Wipe all recorded matches. Useful for tests and for "end session" flows.
 */
export function resetMatchedQuestions(): void {
  matchesBySession.clear();
}

/**
 * Compute relevance for a candidate transcript against a registered pattern.
 * The current implementation is a simple case-insensitive substring test —
 * substring match yields `pattern.relevance`, otherwise 0. Audio-based
 * scoring is owned by the runtime matcher (browser-side).
 */
export function scoreMatch(transcript: string, pattern: QuestionPattern): number {
  if (!pattern.enabled) return 0;
  if (!transcript) return 0;
  const t = transcript.toLowerCase();
  const p = pattern.pattern.toLowerCase();
  if (t.includes(p)) return pattern.relevance;
  return 0;
}

/**
 * Find the best-scoring enabled pattern for a transcript. Returns `null`
 * when no pattern matches.
 */
export function findBestMatch(
  transcript: string,
  patterns: ReadonlyArray<QuestionPattern>,
): { pattern: QuestionPattern; relevance: number } | null {
  let best: { pattern: QuestionPattern; relevance: number } | null = null;
  for (const pattern of patterns) {
    const relevance = scoreMatch(transcript, pattern);
    if (relevance === 0) continue;
    if (!best || relevance > best.relevance) {
      best = { pattern, relevance };
    }
  }
  return best;
}
