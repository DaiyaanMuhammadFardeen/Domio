/**
 * Multiple-choice question validator.
 *
 * Spec: the answer is the chosen choice id; matches `correctChoiceId`.
 * Score = 1 if correct else 0.
 */

import type { QuestionValidationResult } from '../../types.js';

export function validateMultipleChoice(
  answer: unknown,
  expected: { readonly correctChoiceId: string },
): QuestionValidationResult {
  if (typeof answer !== 'string') {
    return { correct: false, confidence: 1, score: 0 };
  }
  const ok = answer === expected.correctChoiceId;
  return { correct: ok, confidence: 1, score: ok ? 1 : 0 };
}
