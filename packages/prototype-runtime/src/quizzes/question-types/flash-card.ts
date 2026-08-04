/**
 * Flash-card question "validator".
 *
 * Flash cards are self-paced — there is no canonical correct answer.
 * The viewer flips the card and marks themselves as known/unknown.
 * The runtime reports `correct = true` if the viewer said known
 * (they accept what they saw); the editor uses `score` to drive
 * spaced-repetition scheduling downstream.
 *
 * Spec: answer is `{ known: boolean }`. Both values pass; `score` is
 * 1 for known and 0.5 for unknown (so the card still counts as
 * "engaged").
 */

import type { QuestionValidationResult } from '../../types.js';

export function validateFlashCard(
  answer: unknown,
): QuestionValidationResult {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return { correct: false, confidence: 1, score: 0 };
  }
  const obj = answer as { known?: unknown };
  if (typeof obj.known !== 'boolean') {
    return { correct: false, confidence: 1, score: 0 };
  }
  if (obj.known) {
    return { correct: true, confidence: 1, score: 1 };
  }
  return { correct: false, confidence: 1, score: 0.5 };
}