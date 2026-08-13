/**
 * Multi-select question validator.
 *
 * Spec: set equality between `answer` (string[]) and
 * `expected.correctChoiceIds`. Partial credit: 0.5 if any subset
 * overlap but neither set equals the other.
 */

import type { QuestionValidationResult } from '../../types.js';

export function validateMultiSelect(
  answer: unknown,
  expected: { readonly correctChoiceIds: readonly string[] },
): QuestionValidationResult {
  if (!Array.isArray(answer)) {
    return { correct: false, confidence: 1, score: 0 };
  }
  const correct = new Set(expected.correctChoiceIds);
  const chosen = new Set(answer.filter((x): x is string => typeof x === 'string'));
  if (chosen.size === 0 && correct.size === 0) {
    return { correct: true, confidence: 1, score: 1 };
  }
  const equals = chosen.size === correct.size && [...chosen].every((c) => correct.has(c));
  if (equals) return { correct: true, confidence: 1, score: 1 };
  const intersect = [...chosen].filter((c) => correct.has(c)).length;
  if (intersect > 0) {
    return { correct: false, confidence: 1, score: 0.5 };
  }
  return { correct: false, confidence: 1, score: 0 };
}
