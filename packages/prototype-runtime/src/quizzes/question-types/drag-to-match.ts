/**
 * Drag-to-match question validator.
 *
 * Spec: the answer is a Record<leftId, rightId>; matches expected
 * pairs. Score = correct_pairs / total_pairs.
 */

import type { QuestionValidationResult } from '../../types.js';

export function validateDragToMatch(
  answer: unknown,
  expected: { readonly pairs: ReadonlyArray<{ readonly left: string; readonly right: string }> },
): QuestionValidationResult {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    return { correct: false, confidence: 1, score: 0 };
  }
  const provided = answer as Record<string, unknown>;
  if (expected.pairs.length === 0) {
    return { correct: true, confidence: 1, score: 1 };
  }
  let ok = 0;
  for (const pair of expected.pairs) {
    if (provided[pair.left] === pair.right) ok++;
  }
  const score = ok / expected.pairs.length;
  return { correct: score === 1, confidence: 1, score };
}
