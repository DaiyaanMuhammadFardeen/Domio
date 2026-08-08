/**
 * @domio/quiz-engine — in-memory store.
 */

import type { Quiz, QuizQuestion, QuizAnswer, LeaderboardRow } from '../types.js';
import {
  type QuizStore,
  type CreateQuizRow,
  type UpdateQuizRow,
  type AddQuestionRow,
  type AnswerRow,
  notFoundError,
  conflictError,
  closedError,
  duplicateAnswerError,
} from '../store.js';

export class InMemoryQuizStore implements QuizStore {
  private readonly quizzes = new Map<string, Quiz>();
  private readonly questions = new Map<string, QuizQuestion>();
  private readonly answers = new Map<string, QuizAnswer>();
  private readonly answerIndex = new Map<string, string>(); // question_id::participant_id -> answer_id

  private answerKey(q: string, p: string): string {
    return `${q}::${p}`;
  }

  async create(row: CreateQuizRow): Promise<Quiz> {
    if (this.quizzes.has(row.quiz.id)) throw conflictError(row.quiz.id, -1);
    this.quizzes.set(row.quiz.id, row.quiz);
    return row.quiz;
  }

  async getById(id: string): Promise<Quiz | null> {
    return this.quizzes.get(id) ?? null;
  }

  async update(row: UpdateQuizRow): Promise<Quiz> {
    const existing = this.quizzes.get(row.quiz_id);
    if (!existing) throw notFoundError(row.quiz_id);
    if (existing.version !== row.expected_version) {
      throw conflictError(row.quiz_id, existing.version);
    }
    this.quizzes.set(row.quiz_id, row.next);
    return row.next;
  }

  async addQuestion(row: AddQuestionRow): Promise<QuizQuestion> {
    const q = this.quizzes.get(row.question.quiz_id);
    if (!q) throw notFoundError(row.question.quiz_id);
    this.questions.set(row.question.id, row.question);
    return row.question;
  }

  async listQuestions(quiz_id: string): Promise<ReadonlyArray<QuizQuestion>> {
    const out: QuizQuestion[] = [];
    for (const q of this.questions.values()) {
      if (q.quiz_id === quiz_id) out.push(q);
    }
    out.sort((a, b) => a.position - b.position);
    return out;
  }

  async answer(row: AnswerRow): Promise<QuizAnswer> {
    const q = this.quizzes.get(row.answer.quiz_id);
    if (!q) throw notFoundError(row.answer.quiz_id);
    if (q.status !== 'open') throw closedError(row.answer.quiz_id);
    const question = this.questions.get(row.answer.question_id);
    if (!question) throw notFoundError(row.answer.question_id);
    const k = this.answerKey(question.id, row.answer.participant_id);
    if (this.answerIndex.has(k)) throw duplicateAnswerError(question.id, row.answer.participant_id);
    this.answers.set(row.answer.id, row.answer);
    this.answerIndex.set(k, row.answer.id);
    return row.answer;
  }

  async leaderboard(quiz_id: string): Promise<ReadonlyArray<LeaderboardRow>> {
    const tally = new Map<string, LeaderboardRow>();
    for (const a of this.answers.values()) {
      if (a.quiz_id !== quiz_id) continue;
      const existing = tally.get(a.participant_id);
      if (existing) {
        tally.set(a.participant_id, {
          participant_id: existing.participant_id,
          total_points: existing.total_points + a.points_awarded,
          correct_count: existing.correct_count + (a.is_correct ? 1 : 0),
          total_count: existing.total_count + 1,
        });
      } else {
        tally.set(a.participant_id, {
          participant_id: a.participant_id,
          total_points: a.points_awarded,
          correct_count: a.is_correct ? 1 : 0,
          total_count: 1,
        });
      }
    }
    return Array.from(tally.values()).sort((a, b) => b.total_points - a.total_points);
  }
}
