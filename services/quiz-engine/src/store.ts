/**
 * @domio/quiz-engine — store interface.
 */

import type { Quiz, QuizQuestion, QuizAnswer, LeaderboardRow } from './types.js';

export interface CreateQuizRow { quiz: Quiz; }
export interface UpdateQuizRow { quiz_id: string; expected_version: number; next: Quiz; }
export interface AddQuestionRow { question: QuizQuestion; }
export interface AnswerRow { answer: QuizAnswer; expected_existing: QuizAnswer | null; }

export interface QuizStoreError extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'CLOSED' | 'DUPLICATE' | 'OUT_OF_RANGE';
}
function makeStoreError(code: QuizStoreError['code'], message: string): QuizStoreError {
  const e = new Error(message) as QuizStoreError & { code: QuizStoreError['code'] };
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}
export const notFoundError = (id: string): QuizStoreError => makeStoreError('NOT_FOUND', `quiz ${id} not found`);
export const conflictError = (id: string, v: number): QuizStoreError => makeStoreError('CONFLICT', `quiz ${id} concurrency (current ${v})`);
export const closedError = (id: string): QuizStoreError => makeStoreError('CLOSED', `quiz ${id} is not open`);
export const duplicateAnswerError = (q: string, p: string): QuizStoreError => makeStoreError('DUPLICATE', `${p} already answered ${q}`);
export const outOfRangeError = (i: number, n: number): QuizStoreError => makeStoreError('OUT_OF_RANGE', `choice ${i} out of range (${n})`);

export interface QuizStore {
  create(row: CreateQuizRow): Promise<Quiz>;
  getById(id: string): Promise<Quiz | null>;
  update(row: UpdateQuizRow): Promise<Quiz>;
  addQuestion(row: AddQuestionRow): Promise<QuizQuestion>;
  listQuestions(quiz_id: string): Promise<ReadonlyArray<QuizQuestion>>;
  answer(row: AnswerRow): Promise<QuizAnswer>;
  leaderboard(quiz_id: string): Promise<ReadonlyArray<LeaderboardRow>>;
}

export function isQuizStore(v: unknown): v is QuizStore {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { create?: unknown }).create === 'function' &&
    typeof (v as { getById?: unknown }).getById === 'function' &&
    typeof (v as { answer?: unknown }).answer === 'function'
  );
}
