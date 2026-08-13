/**
 * True/false question validator.
 */

import type { QuestionValidationResult } from '../../types.js';

export function validateTrueFalse(
  answer: unknown,
  expected: { readonly correct: boolean },
): QuestionValidationResult {
  if (typeof answer !== 'boolean') {
    return { correct: false, confidence: 1, score: 0 };
  }
  const ok = answer === expected.correct;
  return { correct: ok, confidence: 1, score: ok ? 1 : 0 };
}
