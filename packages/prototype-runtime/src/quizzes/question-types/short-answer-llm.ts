/**
 * LLM-graded short-answer validator.
 *
 * Spec: the runtime doesn't actually invoke an LLM. The validator
 * receives an injected `grader` (the editor preview wires this up,
 * and production wires it to the LLM gateway). The grader returns
 * `{ score, confidence, reason }`. Below the question's
 * `fallbackThreshold` (default 0.7), the answer is enqueued in the
 * `llm_review_queue` for human review and `needsHumanReview` is true.
 */

import type { QuestionValidationResult } from '../../types.js';

export const DEFAULT_LLM_FALLBACK_THRESHOLD = 0.7;

export interface LlmGraderResult {
  readonly score: number;
  readonly confidence: number;
  readonly reason: string;
}

export type LlmGrader = (
  submitted: string,
  reference: string,
) => Promise<LlmGraderResult> | LlmGraderResult;

export async function validateShortAnswerLlm(
  answer: unknown,
  expected: { readonly referenceAnswer: string; readonly fallbackThreshold?: number },
  grader: LlmGrader,
): Promise<QuestionValidationResult> {
  if (typeof answer !== 'string') {
    return { correct: false, confidence: 1, score: 0, needsHumanReview: false };
  }
  const threshold = expected.fallbackThreshold ?? DEFAULT_LLM_FALLBACK_THRESHOLD;
  const graded = await grader(answer, expected.referenceAnswer);
  const correct = graded.score >= threshold;
  const needsReview = graded.confidence < threshold;
  return {
    correct,
    confidence: graded.confidence,
    score: graded.score,
    needsHumanReview: needsReview,
  };
}
