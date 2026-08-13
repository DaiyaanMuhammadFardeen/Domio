/**
 * QuizRuntime — drives a single attempt at a quiz.
 *
 * Spec M6.1:
 *   - `start(quizId, seed)` — initialize with a deterministic seed for
 *     re-attempts (the seed randomizes question order).
 *   - `answer(questionId, value)` — submit an answer; validates and
 *     stores. Throws if the question is unknown or the attempt is
 *     completed.
 *   - `score()` — current total score (0..maxScore).
 *   - `attempts()` — list of Q/A results in submission order.
 *   - `complete()` — finalize the attempt, returning the aggregate
 *     `QuizResult`. Idempotent.
 *
 * LLM-graded questions accept an injected `grader` (default: a
 * deterministic mock that returns `score = 0` and `confidence = 0`).
 * When the grader returns `confidence < fallbackThreshold`, the
 * answer is flagged for human review.
 *
 * Visibility is in-memory only; the runtime is the in-process engine
 * the editor preview uses. The service persists attempts.
 */

import type {
  QuestionSpec,
  QuestionValidationResult,
  Quiz,
  QuizAnswer,
  QuizResult,
} from '../types.js';
import { validateMultipleChoice } from './question-types/multiple-choice.js';
import { validateMultiSelect } from './question-types/multi-select.js';
import { validateTrueFalse } from './question-types/true-false.js';
import { validateShortAnswer, validateFillBlank } from './question-types/short-answer.js';
import { validateDragToMatch } from './question-types/drag-to-match.js';
import { validateHotspotQuiz } from './question-types/hotspot-quiz.js';
import { validateFlashCard } from './question-types/flash-card.js';
import {
  validateShortAnswerLlm,
  type LlmGrader,
  DEFAULT_LLM_FALLBACK_THRESHOLD,
} from './question-types/short-answer-llm.js';

export interface QuizRuntimeOptions {
  readonly llmGrader?: LlmGrader;
  readonly idGenerator?: () => string;
  readonly clock?: () => number;
}

export interface QuizAttemptSummary {
  readonly attemptId: string;
  readonly quizId: string;
  readonly answers: readonly QuizAnswer[];
  readonly totalScore: number;
  readonly maxScore: number;
  readonly percentage: number;
  readonly passed: boolean;
  readonly completedAt: number | null;
}

interface InternalState {
  readonly attemptId: string;
  readonly quizId: string;
  readonly seed: string;
  readonly orderedQuestions: readonly QuestionSpec[];
  readonly answers: Map<string, QuizAnswer>;
  readonly completionEmitted: boolean;
  startedAt: number;
  completedAt: number | null;
  cachedResult: QuizResult | null;
}

export const DEFAULT_PASS_THRESHOLD = 0.7;
export const DEFAULT_POINTS = 1;

function defaultIdGenerator(): string {
  return `at-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultClock(): number {
  return Date.now();
}

const defaultLlmGrader: LlmGrader = () => ({
  score: 0,
  confidence: 0,
  reason: 'no grader injected',
});

/**
 * Mulberry32 PRNG seeded with the integer form of the seed string.
 * Deterministic across runs for the same seed.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = xs.slice();
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) >>> 0;
    const t = s;
    const j = t % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export class QuizRuntime {
  private readonly opts: Required<QuizRuntimeOptions>;
  private quiz: Quiz | null = null;
  private state: InternalState | null = null;

  constructor(opts: QuizRuntimeOptions = {}) {
    this.opts = {
      llmGrader: opts.llmGrader ?? defaultLlmGrader,
      idGenerator: opts.idGenerator ?? defaultIdGenerator,
      clock: opts.clock ?? defaultClock,
    };
  }

  /** Start an attempt. Returns the attempt id. */
  start(quiz: Quiz, seed: string): string {
    const order = shuffle(quiz.questions, hashSeed(seed));
    this.quiz = quiz;
    this.state = {
      attemptId: this.opts.idGenerator(),
      quizId: quiz.id,
      seed,
      orderedQuestions: order,
      answers: new Map(),
      completionEmitted: false,
      startedAt: this.opts.clock(),
      completedAt: null,
      cachedResult: null,
    };
    return this.state.attemptId;
  }

  /** Submit an answer for a question. Returns the validation result. */
  async answer(questionId: string, value: unknown): Promise<QuestionValidationResult> {
    const state = this.state;
    const quiz = this.quiz;
    if (!state || !quiz) throw new Error('QuizRuntime: call start() before answer()');
    if (state.completedAt !== null) {
      throw new Error('QuizRuntime: attempt already completed');
    }
    const question = state.orderedQuestions.find((q) => q.id === questionId);
    if (!question) throw new Error(`QuizRuntime: unknown question ${questionId}`);

    const result = await this.validateAnswer(question, value);
    const record: QuizAnswer = {
      id: this.opts.idGenerator(),
      tenantId: quiz.tenantId,
      attemptId: state.attemptId,
      questionId,
      value,
      correct: result.correct,
      score: result.score,
      confidence: result.confidence,
      needsHumanReview: result.needsHumanReview === true,
      submittedAt: this.opts.clock(),
    };
    state.answers.set(questionId, record);
    return result;
  }

  /** Calculate current total score. */
  score(): { raw: number; max: number; percentage: number } {
    const state = this.state;
    if (!state) return { raw: 0, max: 0, percentage: 0 };
    let raw = 0;
    let max = 0;
    for (const question of state.orderedQuestions) {
      const points = question.points ?? DEFAULT_POINTS;
      max += points;
      const ans = state.answers.get(question.id);
      if (ans) raw += ans.score * points;
    }
    return {
      raw,
      max,
      percentage: max === 0 ? 0 : raw / max,
    };
  }

  /** List all submitted answers in submission order. */
  attempts(): readonly QuizAnswer[] {
    const state = this.state;
    if (!state) return [];
    return Array.from(state.answers.values()).sort((a, b) => a.submittedAt - b.submittedAt);
  }

  /**
   * Finalize the attempt. Returns the aggregate result. Idempotent;
   * repeated calls return the same result.
   */
  complete(): QuizResult {
    const state = this.state;
    const quiz = this.quiz;
    if (!state || !quiz) throw new Error('QuizRuntime: call start() before complete()');
    if (state.completedAt === null) {
      state.completedAt = this.opts.clock();
    }
    if (state.cachedResult) return state.cachedResult;
    const summary = this.score();
    const passThreshold = quiz.passThreshold ?? DEFAULT_PASS_THRESHOLD;
    const passed = summary.percentage >= passThreshold;
    const result: QuizResult = {
      id: this.opts.idGenerator(),
      tenantId: quiz.tenantId,
      attemptId: state.attemptId,
      quizId: quiz.id,
      totalScore: summary.raw,
      maxScore: summary.max,
      percentage: summary.percentage,
      passed,
      answers: this.attempts(),
      completedAt: state.completedAt,
    };
    state.cachedResult = result;
    return result;
  }

  /** Reset the runtime — discards any current attempt. */
  reset(): void {
    this.state = null;
    this.quiz = null;
  }

  /** The current question order (deterministic per seed). */
  orderedQuestions(): readonly QuestionSpec[] {
    return this.state?.orderedQuestions.slice() ?? [];
  }

  /** Currently active attempt id. */
  currentAttemptId(): string | null {
    return this.state?.attemptId ?? null;
  }

  /** True if the attempt is finalized. */
  isCompleted(): boolean {
    return this.state?.completedAt !== null && this.state?.completedAt !== undefined;
  }

  /** Total points possible across all questions. */
  maxScore(): number {
    if (!this.state) return 0;
    let max = 0;
    for (const q of this.state.orderedQuestions) {
      max += q.points ?? DEFAULT_POINTS;
    }
    return max;
  }

  /** Get the latest answer for a question, if any. */
  answerFor(questionId: string): QuizAnswer | null {
    return this.state?.answers.get(questionId) ?? null;
  }

  /** Test the LLM fallback threshold default. */
  static defaultLlmFallbackThreshold(): number {
    return DEFAULT_LLM_FALLBACK_THRESHOLD;
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private async validateAnswer(
    question: QuestionSpec,
    value: unknown,
  ): Promise<QuestionValidationResult> {
    switch (question.type) {
      case 'multiple_choice':
        return validateMultipleChoice(value, question);
      case 'multi_select':
        return validateMultiSelect(value, question);
      case 'true_false':
        return validateTrueFalse(value, question);
      case 'short_answer':
        return validateShortAnswer(value, question);
      case 'fill_blank':
        return validateFillBlank(value, question);
      case 'drag_to_match':
        return validateDragToMatch(value, question);
      case 'hotspot_quiz':
        return validateHotspotQuiz(value, question);
      case 'flash_card':
        return validateFlashCard(value);
      case 'short_answer_llm':
        return validateShortAnswerLlm(value, question, this.opts.llmGrader);
      default: {
        const _exhaustive: never = question;
        void _exhaustive;
        return { correct: false, confidence: 1, score: 0 };
      }
    }
  }
}
