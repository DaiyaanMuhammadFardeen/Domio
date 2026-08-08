/**
 * @domio/quiz-engine — orchestration service.
 *
 * Phase 16 W7. Authors quizzes with questions, opens for submissions,
 * and scores answers server-side. Server-clock scoring uses the
 * service's notion of `now_ms` and the participant's claimed offset
 * to compute a fair grade even when wall-clock differs.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import {
  type Quiz,
  type QuizQuestion,
  type QuizAnswer,
  type QuizChoice,
  type LeaderboardRow,
  QuizError,
} from './types.js';
import {
  type QuizStore,
  isQuizStore,
  notFoundError,
  closedError,
  outOfRangeError,
} from './store.js';
import { type IdempotencyStore, InMemoryIdempotencyStore } from './idempotency/index.js';
import {
  type QuizAuditEmitter,
  type QuizAuditEvent,
} from './audit/emit.js';
import { type QuizEngineMetrics, NullQuizEngineMetrics } from './observability/metrics.js';

export interface QuizEngineOptions {
  readonly store: QuizStore;
  readonly bus: EdgeBus;
  readonly audit: QuizAuditEmitter;
  readonly idempotency?: IdempotencyStore | undefined;
  readonly metrics?: QuizEngineMetrics | undefined;
  readonly now_ms?: () => number;
  readonly id_factory?: () => string;
}

export interface CreateQuizInput {
  workspace_id: string;
  session_id: string;
  widget_id: string;
  title: string;
  server_clock?: boolean;
  show_answers?: boolean;
  opens_at_ms?: number | null;
  closes_at_ms?: number | null;
  created_by: string;
}

export interface AddQuestionInput {
  workspace_id: string;
  quiz_id: string;
  prompt: string;
  choices: ReadonlyArray<{ label: string }>;
  correct_index: number | null;
  points?: number;
  time_limit_ms?: number | null;
}

export interface AnswerInput {
  workspace_id: string;
  quiz_id: string;
  question_id: string;
  participant_id: string;
  choice_index: number;
  idempotency_key: string;
  participant_claimed_at_ms?: number;
}

export class QuizEngine {
  private readonly store: QuizStore;
  private readonly bus: EdgeBus;
  private readonly idem: IdempotencyStore;
  private readonly audit: QuizAuditEmitter;
  private readonly metrics: QuizEngineMetrics;
  private readonly now_ms: () => number;
  private readonly id_factory: () => string;

  constructor(opts: QuizEngineOptions) {
    if (!isQuizStore(opts.store)) {
      throw new Error('QuizEngine: store is required');
    }
    this.store = opts.store;
    this.bus = opts.bus;
    this.idem = opts.idempotency ?? new InMemoryIdempotencyStore();
    this.audit = opts.audit;
    this.metrics = opts.metrics ?? new NullQuizEngineMetrics();
    this.now_ms = opts.now_ms ?? (() => Date.now());
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
  }

  async create(input: CreateQuizInput): Promise<Quiz> {
    const id = this.id_factory();
    const ts = this.now_ms();
    const quiz: Quiz = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      widget_id: input.widget_id,
      title: input.title,
      status: 'draft',
      server_clock: input.server_clock ?? true,
      show_answers: input.show_answers ?? false,
      opens_at_ms: input.opens_at_ms ?? null,
      closes_at_ms: input.closes_at_ms ?? null,
      created_by: input.created_by,
      created_at_ms: ts,
      updated_at_ms: ts,
      version: 1,
    };
    const created = await this.store.create({ quiz });
    await this.emitAudit({
      actor_id: input.created_by,
      workspace_id: created.workspace_id,
      session_id: created.session_id,
      quiz_id: created.id,
      question_id: null,
      ts,
      action: 'quiz.create',
      after: { title: created.title, status: created.status },
    });
    this.metrics.quizzes_created.inc(1, { workspace_id: created.workspace_id });
    return created;
  }

  async open(quiz_id: string, expected_version: number, actor_id: string): Promise<Quiz> {
    const current = await this.store.getById(quiz_id);
    if (!current) throw notFoundError(quiz_id);
    if (current.status !== 'draft') throw closedError(quiz_id);
    const ts = this.now_ms();
    const next: Quiz = { ...current, status: 'open', updated_at_ms: ts, version: current.version + 1 };
    const updated = await this.store.update({ quiz_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      quiz_id,
      question_id: null,
      ts,
      action: 'quiz.open',
      before: { status: current.status },
      after: { status: 'open' },
    });
    return updated;
  }

  async close(quiz_id: string, expected_version: number, actor_id: string): Promise<Quiz> {
    const current = await this.store.getById(quiz_id);
    if (!current) throw notFoundError(quiz_id);
    if (current.status !== 'open') throw closedError(quiz_id);
    const ts = this.now_ms();
    const next: Quiz = { ...current, status: 'closed', updated_at_ms: ts, version: current.version + 1 };
    const updated = await this.store.update({ quiz_id, expected_version, next });
    await this.emitAudit({
      actor_id,
      workspace_id: updated.workspace_id,
      session_id: updated.session_id,
      quiz_id,
      question_id: null,
      ts,
      action: 'quiz.close',
      before: { status: current.status },
      after: { status: 'closed' },
    });
    return updated;
  }

  async addQuestion(input: AddQuestionInput): Promise<QuizQuestion> {
    const quiz = await this.store.getById(input.quiz_id);
    if (!quiz) throw notFoundError(input.quiz_id);
    const existing = await this.store.listQuestions(input.quiz_id);
    const choices: QuizChoice[] = input.choices.map((c, i) => ({ index: i, label: c.label }));
    if (input.correct_index !== null && (input.correct_index < 0 || input.correct_index >= choices.length)) {
      throw outOfRangeError(input.correct_index, choices.length);
    }
    const question: QuizQuestion = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      quiz_id: input.quiz_id,
      position: existing.length,
      prompt: input.prompt,
      choices,
      correct_index: input.correct_index,
      points: input.points ?? 1,
      time_limit_ms: input.time_limit_ms ?? null,
    };
    const stored = await this.store.addQuestion({ question });
    await this.emitAudit({
      actor_id: 'system',
      workspace_id: input.workspace_id,
      session_id: quiz.session_id,
      quiz_id: input.quiz_id,
      question_id: stored.id,
      ts: this.now_ms(),
      action: 'quiz.question.add',
      after: { position: stored.position, prompt: stored.prompt },
    });
    return stored;
  }

  async answer(input: AnswerInput): Promise<QuizAnswer> {
    const start = this.now_ms();
    const idem = await this.idem.reserve({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      session_id: 'quiz-' + input.quiz_id,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    if (idem.exists && idem.prior) {
      return idem.prior.response as QuizAnswer;
    }
    const quiz = await this.store.getById(input.quiz_id);
    if (!quiz) throw notFoundError(input.quiz_id);
    const questions = await this.store.listQuestions(input.quiz_id);
    const question = questions.find((q) => q.id === input.question_id);
    if (!question) throw notFoundError(input.question_id);
    if (input.choice_index < 0 || input.choice_index >= question.choices.length) {
      throw outOfRangeError(input.choice_index, question.choices.length);
    }
    const is_correct = question.correct_index !== null && input.choice_index === question.correct_index;
    const points_awarded = is_correct ? question.points : 0;
    const server_offset_ms = input.participant_claimed_at_ms
      ? this.now_ms() - input.participant_claimed_at_ms
      : 0;
    const ans: QuizAnswer = {
      id: this.id_factory(),
      workspace_id: input.workspace_id,
      session_id: quiz.session_id,
      quiz_id: input.quiz_id,
      question_id: input.question_id,
      participant_id: input.participant_id,
      choice_index: input.choice_index,
      is_correct,
      points_awarded,
      answered_at_ms: this.now_ms(),
      server_offset_ms,
      idempotency_key: input.idempotency_key,
    };
    const stored = await this.store.answer({ answer: ans, expected_existing: null });
    await this.idem.commit({
      key: input.idempotency_key,
      workspace_id: input.workspace_id,
      session_id: 'quiz-' + input.quiz_id,
      response: stored,
      recorded_at_ms: ans.answered_at_ms,
      ttl_ms: 24 * 60 * 60 * 1000,
    });
    await this.emitAudit({
      actor_id: input.participant_id,
      workspace_id: input.workspace_id,
      session_id: quiz.session_id,
      quiz_id: input.quiz_id,
      question_id: input.question_id,
      ts: ans.answered_at_ms,
      action: 'quiz.answer',
      after: { choice_index: ans.choice_index, is_correct, points_awarded },
    });
    this.metrics.answers.inc(1, { workspace_id: input.workspace_id });
    this.metrics.answer_latency_ms.observe(this.now_ms() - start, { workspace_id: input.workspace_id });
    await this.bus.publish({
      session_id: quiz.session_id,
      topic: 'quiz',
      payload: encode({
        kind: 'answer',
        quiz_id: input.quiz_id,
        question_id: input.question_id,
        participant_id: input.participant_id,
        points_awarded,
      }),
    });
    if (quiz.show_answers) {
      await this.bus.publish({
        session_id: quiz.session_id,
        topic: 'quiz',
        payload: encode({
          kind: 'show_answer',
          quiz_id: input.quiz_id,
          question_id: input.question_id,
          correct_index: question.correct_index,
        }),
      });
    }
    return stored;
  }

  async leaderboard(quiz_id: string): Promise<ReadonlyArray<LeaderboardRow>> {
    return this.store.leaderboard(quiz_id);
  }

  private async emitAudit(event: QuizAuditEvent): Promise<void> {
    await this.audit.emit(event);
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

void QuizError;
