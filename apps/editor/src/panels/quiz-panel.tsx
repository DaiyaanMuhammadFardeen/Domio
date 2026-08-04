/**
 * QuizPanel — author and edit quizzes attached to the active deck.
 *
 * Phase 10 (M6.1). Surfaces CRUD for the QuizRuntime type:
 * - Pick a question type from the 9-type catalogue
 * - Edit prompt + per-type fields (choices, accepted_answers, etc.)
 * - Set passThreshold (0..1)
 * - Track version + re-publish with optimistic locking
 *
 * Renders only the editor surface — persistence lives in the
 * `prototype-runtime-service` and its `quizzes` repository.
 */

'use client';

import { useCallback } from 'react';
import type { ReactElement } from 'react';

export type QuizQuestionType =
  | 'multiple_choice'
  | 'multi_select'
  | 'true_false'
  | 'short_answer'
  | 'fill_blank'
  | 'drag_to_match'
  | 'hotspot_quiz'
  | 'flash_card'
  | 'short_answer_llm';

export interface QuizQuestionSpec {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  /** Discriminated by `type`; we keep `unknown` here for editor flexibility. */
  [key: string]: unknown;
}

export interface QuizRecord {
  id: string;
  tenantId: string;
  deckId: string;
  name: string;
  questions: QuizQuestionSpec[];
  passThreshold?: number;
  version: number;
}

interface QuizPanelProps {
  quiz: QuizRecord;
  onPatch: (patch: { name?: string; questions?: QuizQuestionSpec[]; passThreshold?: number; version: number }) => void;
  onDelete?: () => void;
}

const QUESTION_TYPES: Array<{ value: QuizQuestionType; label: string }> = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'fill_blank', label: 'Fill blank' },
  { value: 'drag_to_match', label: 'Drag to match' },
  { value: 'hotspot_quiz', label: 'Hotspot' },
  { value: 'flash_card', label: 'Flash card' },
  { value: 'short_answer_llm', label: 'Short answer (LLM)' },
];

function nextId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function QuizPanel({ quiz, onPatch, onDelete }: QuizPanelProps): ReactElement {
  const updateName = useCallback(
    (name: string) => onPatch({ version: quiz.version, name }),
    [quiz.version, onPatch],
  );

  const updateThreshold = useCallback(
    (passThreshold: number) => onPatch({ version: quiz.version, passThreshold }),
    [quiz.version, onPatch],
  );

  const addQuestion = useCallback(() => {
    const id = nextId();
    const newQ: QuizQuestionSpec = {
      id,
      type: 'true_false',
      prompt: '',
      correct: true,
    };
    onPatch({ version: quiz.version, questions: [...quiz.questions, newQ] });
  }, [quiz.version, quiz.questions, onPatch]);

  const removeQuestion = useCallback(
    (id: string) => {
      onPatch({ version: quiz.version, questions: quiz.questions.filter((q) => q.id !== id) });
    },
    [quiz.version, quiz.questions, onPatch],
  );

  const updateQuestionType = useCallback(
    (id: string, type: QuizQuestionType) => {
      onPatch({
        version: quiz.version,
        questions: quiz.questions.map((q) => (q.id === id ? { ...q, type, prompt: '' } : q)),
      });
    },
    [quiz.version, quiz.questions, onPatch],
  );

  const updateQuestionPrompt = useCallback(
    (id: string, prompt: string) => {
      onPatch({
        version: quiz.version,
        questions: quiz.questions.map((q) => (q.id === id ? { ...q, prompt } : q)),
      });
    },
    [quiz.version, quiz.questions, onPatch],
  );

  return (
    <div className="quiz-panel" data-testid="m6-quiz-panel">
      <div className="props-panel__section-title">Quiz</div>
      <div className="prop-field">
        <label className="prop-field__label">Name</label>
        <input
          type="text"
          className="prop-field__input"
          value={quiz.name}
          onChange={(e) => updateName(e.target.value)}
          data-testid="m6-quiz-name"
        />
      </div>
      <div className="prop-field">
        <label className="prop-field__label">Pass threshold</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          className="prop-field__input"
          value={quiz.passThreshold ?? 0.7}
          onChange={(e) => updateThreshold(Number(e.target.value))}
          data-testid="m6-quiz-threshold"
        />
      </div>

      <div className="props-panel__section-title">Questions ({quiz.questions.length})</div>
      {quiz.questions.map((q) => (
        <div key={q.id} className="quiz-row" data-testid={`m6-quiz-question-${q.id}`}>
          <select
            value={q.type}
            onChange={(e) => updateQuestionType(q.id, e.target.value as QuizQuestionType)}
            data-testid={`m6-quiz-type-${q.id}`}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={q.prompt}
            placeholder="Prompt"
            onChange={(e) => updateQuestionPrompt(q.id, e.target.value)}
            data-testid={`m6-quiz-prompt-${q.id}`}
          />
          <button
            type="button"
            className="quiz-row__remove"
            aria-label="Remove question"
            onClick={() => removeQuestion(q.id)}
            data-testid={`m6-quiz-remove-${q.id}`}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="prop-control__add"
        onClick={addQuestion}
        data-testid="m6-quiz-add-question"
      >
        + Add question
      </button>

      {onDelete && (
        <button
          type="button"
          className="prop-control__remove"
          onClick={onDelete}
          data-testid="m6-quiz-delete"
        >
          Delete quiz
        </button>
      )}
    </div>
  );
}

export type { QuizPanelProps };
