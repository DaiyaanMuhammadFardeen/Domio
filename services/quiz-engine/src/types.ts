/**
 * @domio/quiz-engine — domain types.
 *
 * Phase 16 W7. Author/edit quizzes at question granularity, open/close,
 * then collect answers with server-clock scoring. Each
 * (question_id, participant_id) is unique (one answer per learner).
 */

export type QuizStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface Quiz {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly widget_id: string;
  readonly title: string;
  readonly status: QuizStatus;
  readonly server_clock: boolean;
  readonly show_answers: boolean;
  readonly opens_at_ms: number | null;
  readonly closes_at_ms: number | null;
  readonly created_by: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly version: number;
}

export interface QuizChoice {
  readonly index: number;
  readonly label: string;
}

export interface QuizQuestion {
  readonly id: string;
  readonly workspace_id: string;
  readonly quiz_id: string;
  readonly position: number;
  readonly prompt: string;
  readonly choices: ReadonlyArray<QuizChoice>;
  readonly correct_index: number | null;
  readonly points: number;
  readonly time_limit_ms: number | null;
}

export interface QuizAnswer {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly quiz_id: string;
  readonly question_id: string;
  readonly participant_id: string;
  readonly choice_index: number;
  readonly is_correct: boolean | null;
  readonly points_awarded: number;
  readonly answered_at_ms: number;
  readonly server_offset_ms: number;
  readonly idempotency_key: string;
}

export interface LeaderboardRow {
  readonly participant_id: string;
  readonly total_points: number;
  readonly correct_count: number;
  readonly total_count: number;
}

export class QuizError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'QuizError';
  }
}
