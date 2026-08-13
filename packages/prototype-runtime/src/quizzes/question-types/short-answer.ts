/**
 * Short-answer / fill-blank question validator.
 *
 * Spec: case-insensitive, whitespace-trimmed comparison against any
 * accepted answer. Optional `typoTolerance` (0..1) uses Levenshtein
 * similarity. Default tolerance = 0.85.
 *
 * Levenshtein similarity: `1 - distance(a, b) / max(|a|, |b|)`.
 */

import type { QuestionValidationResult } from '../../types.js';

export const DEFAULT_TYPO_TOLERANCE = 0.85;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function validateShortAnswer(
  answer: unknown,
  expected: { readonly acceptedAnswers: readonly string[]; readonly typoTolerance?: number },
): QuestionValidationResult {
  if (typeof answer !== 'string') {
    return { correct: false, confidence: 1, score: 0 };
  }
  const tolerance = expected.typoTolerance ?? DEFAULT_TYPO_TOLERANCE;
  const submitted = normalize(answer);
  if (submitted.length === 0) {
    return { correct: false, confidence: 1, score: 0 };
  }
  let bestScore = 0;
  for (const candidate of expected.acceptedAnswers) {
    const cand = normalize(candidate);
    // Exact match short-circuits.
    if (submitted === cand) {
      return { correct: true, confidence: 1, score: 1 };
    }
    const sim = similarity(submitted, cand);
    if (sim > bestScore) bestScore = sim;
  }
  const ok = bestScore >= tolerance;
  // Score is `bestScore` clamped to tolerance floor: matches that pass
  // the typo threshold get full credit; near-misses get proportional
  // partial credit when within 0.10 of the threshold.
  return {
    correct: ok,
    confidence: 1,
    score: ok ? 1 : Math.max(0, bestScore - tolerance + 0.1) / 0.1,
  };
}

export function validateFillBlank(
  answer: unknown,
  expected: {
    readonly blanks: ReadonlyArray<{
      readonly id: string;
      readonly acceptedAnswers: readonly string[];
      readonly typoTolerance?: number;
    }>;
  },
): QuestionValidationResult {
  // Answer is a Record<blankId, string>.
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return { correct: false, confidence: 1, score: 0 };
  }
  const provided = answer as Record<string, unknown>;
  if (expected.blanks.length === 0) {
    return { correct: true, confidence: 1, score: 1 };
  }
  let okCount = 0;
  let totalScore = 0;
  for (const blank of expected.blanks) {
    const sub = provided[blank.id];
    const result = validateShortAnswer(sub, {
      acceptedAnswers: blank.acceptedAnswers,
      ...(blank.typoTolerance !== undefined ? { typoTolerance: blank.typoTolerance } : {}),
    });
    if (result.correct) okCount++;
    totalScore += result.score;
  }
  const all = okCount === expected.blanks.length;
  return {
    correct: all,
    confidence: 1,
    score: totalScore / expected.blanks.length,
  };
}
