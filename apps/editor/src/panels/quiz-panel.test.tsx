/**
 * QuizPanel tests (Phase 10 M6.1).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizPanel, type QuizRecord } from './quiz-panel';

const TENANT = 't1';
const DECK = 'd1';

function makeQuiz(): QuizRecord {
  return {
    id: 'qz1',
    tenantId: TENANT,
    deckId: DECK,
    name: 'Onboarding quiz',
    passThreshold: 0.7,
    version: 0,
    questions: [
      { id: 'q1', type: 'true_false', prompt: 'The sky is blue.', correct: true },
      { id: 'q2', type: 'multiple_choice', prompt: 'Capital of France?', choices: [] },
    ],
  };
}

describe('QuizPanel', () => {
  it('renders the editor surface and panels data-testids', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    expect(screen.getByTestId('m6-quiz-panel')).toBeTruthy();
    expect(screen.getByTestId('m6-quiz-name')).toBeTruthy();
    expect(screen.getByTestId('m6-quiz-threshold')).toBeTruthy();
    expect(screen.getByTestId('m6-quiz-add-question')).toBeTruthy();
    expect(screen.getByTestId('m6-quiz-question-q1')).toBeTruthy();
    expect(screen.getByTestId('m6-quiz-question-q2')).toBeTruthy();
  });

  it('renames the quiz', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    fireEvent.change(screen.getByTestId('m6-quiz-name'), { target: { value: 'Renamed' } });
    expect(onPatch).toHaveBeenCalledWith({ version: 0, name: 'Renamed' });
  });

  it('updates the pass threshold', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    fireEvent.change(screen.getByTestId('m6-quiz-threshold'), { target: { value: '0.5' } });
    expect(onPatch).toHaveBeenCalledWith({ version: 0, passThreshold: 0.5 });
  });

  it('adds a new question with default type=true_false', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId('m6-quiz-add-question'));
    expect(onPatch).toHaveBeenCalledTimes(1);
    const arg = onPatch.mock.calls[0]?.[0] as { questions: { type: string }[] };
    expect(arg.questions.length).toBe(3);
    expect(arg.questions[2]?.type).toBe('true_false');
  });

  it('removes a question by id', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId('m6-quiz-remove-q1'));
    const arg = onPatch.mock.calls[0]?.[0] as { questions: { id: string }[] };
    expect(arg.questions.length).toBe(1);
    expect(arg.questions[0]?.id).toBe('q2');
  });

  it('triggers delete when the delete button is wired', () => {
    const onDelete = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('m6-quiz-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('changes a question type and clears its prompt', () => {
    const onPatch = vi.fn();
    render(<QuizPanel quiz={makeQuiz()} onPatch={onPatch} />);
    fireEvent.change(screen.getByTestId('m6-quiz-type-q2'), {
      target: { value: 'short_answer' },
    });
    const arg = onPatch.mock.calls[0]?.[0] as { questions: Array<{ id: string; type: string; prompt: string }> };
    const updated = arg.questions.find((q) => q.id === 'q2');
    expect(updated?.type).toBe('short_answer');
    expect(updated?.prompt).toBe('');
  });
});
