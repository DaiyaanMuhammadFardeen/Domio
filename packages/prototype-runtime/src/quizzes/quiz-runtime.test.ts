import { describe, expect, it } from 'vitest';
import { QuizRuntime } from './quiz-runtime.js';
import type { Quiz, QuizAnswer } from '../types.js';

const TENANT = 'tenant-1';
const DECK = 'deck-1';
const QUIZ_ID = 'quiz-1';

let counter = 0;
function idGen(): string {
  counter += 1;
  return `id-${counter}`;
}

function makeQuiz(partial: Partial<Quiz> = {}): Quiz {
  counter = 0;
  return {
    id: QUIZ_ID,
    tenantId: TENANT,
    deckId: DECK,
    name: 'Onboarding quiz',
    questions: [],
    passThreshold: 0.7,
    version: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('QuizRuntime — multiple-choice', () => {
  it('marks correct answer as correct', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          prompt: 'Capital of France?',
          correctChoiceId: 'paris',
          choices: [
            { id: 'paris', label: 'Paris' },
            { id: 'london', label: 'London' },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed-a');
    const result = await r.answer('q1', 'paris');
    expect(result).toEqual({ correct: true, confidence: 1, score: 1 });
    const sc = r.score();
    expect(sc.raw).toBe(1);
    expect(sc.max).toBe(1);
    expect(sc.percentage).toBe(1);
  });

  it('marks wrong answer as incorrect', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          prompt: 'Capital of France?',
          correctChoiceId: 'paris',
          choices: [
            { id: 'paris', label: 'Paris' },
            { id: 'london', label: 'London' },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed-a');
    const result = await r.answer('q1', 'london');
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe('QuizRuntime — multi-select', () => {
  it('gives full credit for exact match', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'multi_select',
          prompt: 'Pick the primes.',
          correctChoiceIds: ['2', '3', '5'],
          choices: [
            { id: '2', label: '2' },
            { id: '3', label: '3' },
            { id: '4', label: '4' },
            { id: '5', label: '5' },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed-a');
    const result = await r.answer('q1', ['2', '3', '5']);
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('gives partial credit for partial overlap', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'multi_select',
          prompt: 'Pick the primes.',
          correctChoiceIds: ['2', '3', '5'],
          choices: [
            { id: '2', label: '2' },
            { id: '3', label: '3' },
            { id: '4', label: '4' },
            { id: '5', label: '5' },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed-a');
    const result = await r.answer('q1', ['2', '3']);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.5);
  });
});

describe('QuizRuntime — true/false', () => {
  it('marks true correctly', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'true_false', prompt: 'The sky is blue.', correct: true }],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', true)).correct).toBe(true);
    expect((await r.answer('q1', false)).correct).toBe(false);
  });
});

describe('QuizRuntime — short answer + Levenshtein', () => {
  it('accepts exact match', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer',
          prompt: 'Color of grass?',
          acceptedAnswers: ['green'],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', 'green')).correct).toBe(true);
  });

  it('accepts typo within tolerance', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer',
          prompt: 'Color of grass?',
          acceptedAnswers: ['green'],
          typoTolerance: 0.7,
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    // "gren" is 1 substitution away from "green"; similarity = 0.8.
    expect((await r.answer('q1', 'gren')).correct).toBe(true);
  });

  it('rejects answers outside tolerance', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer',
          prompt: 'Color of grass?',
          acceptedAnswers: ['green'],
          typoTolerance: 0.85,
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', 'blue')).correct).toBe(false);
  });

  it('is case-insensitive and trims whitespace', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer',
          prompt: 'Color of grass?',
          acceptedAnswers: ['green'],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', '  GREEN ')).correct).toBe(true);
  });
});

describe('QuizRuntime — fill-in-the-blank', () => {
  it('requires every blank to match', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'fill_blank',
          prompt: 'Hello ___ and ___!',
          blanks: [
            { id: 'b1', acceptedAnswers: ['world'] },
            { id: 'b2', acceptedAnswers: ['friends'] },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    const ok = await r.answer('q1', { b1: 'world', b2: 'friends' });
    expect(ok.correct).toBe(true);
    expect(ok.score).toBe(1);

    const partial = await r.answer('q1', { b1: 'world', b2: 'enemies' });
    expect(partial.correct).toBe(false);
    expect(partial.score).toBe(0.5);
  });
});

describe('QuizRuntime — drag-to-match', () => {
  it('requires all pairs to match', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'drag_to_match',
          prompt: 'Match capital to country.',
          pairs: [
            { left: 'France', right: 'Paris' },
            { left: 'Italy', right: 'Rome' },
          ],
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', { France: 'Paris', Italy: 'Rome' })).correct).toBe(true);
    expect((await r.answer('q1', { France: 'Paris', Italy: 'Milan' })).correct).toBe(false);
  });
});

describe('QuizRuntime — hotspot quiz', () => {
  it('accepts point-in-polygon', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'hotspot_quiz',
          prompt: 'Click the head.',
          geometry: {
            kind: 'polygon',
            points: [
              { x: 0.4, y: 0.4 },
              { x: 0.6, y: 0.4 },
              { x: 0.6, y: 0.6 },
              { x: 0.4, y: 0.6 },
            ],
          },
          tolerance: 0.05,
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', { x: 0.5, y: 0.5 })).correct).toBe(true);
    expect((await r.answer('q1', { x: 0.1, y: 0.1 })).correct).toBe(false);
  });

  it('accepts centroid distance within tolerance', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'hotspot_quiz',
          prompt: 'Click the head.',
          geometry: { kind: 'rect', x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
          tolerance: 0.05,
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    // Centroid is (0.5, 0.5); a click at (0.51, 0.51) is within tolerance.
    expect((await r.answer('q1', { x: 0.51, y: 0.51 })).correct).toBe(true);
  });

  it('rejects out-of-bounds coordinates', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'hotspot_quiz',
          prompt: 'Click the head.',
          geometry: { kind: 'rect', x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', { x: 1.5, y: 0.5 })).correct).toBe(false);
  });
});

describe('QuizRuntime — flash card', () => {
  it('records known/unknown as correct/incorrect with 0.5 score for unknown', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'flash_card',
          prompt: 'Capital of France?',
          front: 'Capital of France?',
          back: 'Paris',
        },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    expect((await r.answer('q1', { known: true })).score).toBe(1);
    expect((await r.answer('q1', { known: false })).score).toBe(0.5);
  });
});

describe('QuizRuntime — LLM-graded short answer', () => {
  it('falls back to human review queue below confidence threshold', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer_llm',
          prompt: 'What is photosynthesis?',
          referenceAnswer: 'Conversion of light energy into chemical energy by plants.',
          fallbackThreshold: 0.7,
        },
      ],
    });
    const r = new QuizRuntime({
      idGenerator: idGen,
      clock: () => 1,
      llmGrader: () => ({ score: 0.9, confidence: 0.4, reason: 'unsure' }),
    });
    r.start(quiz, 'seed');
    const result = await r.answer('q1', 'Plants eat sunlight.');
    expect(result.correct).toBe(true);
    expect(result.confidence).toBe(0.4);
    expect(result.needsHumanReview).toBe(true);
  });

  it('does not enqueue when confidence is above threshold', async () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: 'q1',
          type: 'short_answer_llm',
          prompt: 'What is photosynthesis?',
          referenceAnswer: 'X',
        },
      ],
    });
    const r = new QuizRuntime({
      idGenerator: idGen,
      clock: () => 1,
      llmGrader: () => ({ score: 1, confidence: 0.95, reason: 'confident' }),
    });
    r.start(quiz, 'seed');
    const result = await r.answer('q1', 'Plants convert light to chemical energy.');
    expect(result.needsHumanReview).toBe(false);
  });
});

describe('QuizRuntime — lifecycle', () => {
  it('throws if answer() before start()', async () => {
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    await expect(r.answer('q1', 'x')).rejects.toThrow(/start\(\)/);
  });

  it('throws if complete() before start()', () => {
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    expect(() => r.complete()).toThrow(/start\(\)/);
  });

  it('throws if answer() after complete()', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'true_false', prompt: '?', correct: true }],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    r.complete();
    await expect(r.answer('q1', true)).rejects.toThrow(/completed/);
  });

  it('uses a deterministic seed for question order', () => {
    const questions = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i}`,
      type: 'true_false' as const,
      prompt: `Q${i}?`,
      correct: true,
    }));
    const quiz = makeQuiz({ questions });
    const r1 = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r1.start(quiz, 'same-seed');
    const order1 = r1.orderedQuestions().map((q) => q.id);
    const r2 = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r2.start(quiz, 'same-seed');
    const order2 = r2.orderedQuestions().map((q) => q.id);
    expect(order1).toEqual(order2);
  });

  it('produces different order for different seeds', () => {
    const questions = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i}`,
      type: 'true_false' as const,
      prompt: `Q${i}?`,
      correct: true,
    }));
    const quiz = makeQuiz({ questions });
    const r1 = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r1.start(quiz, 'seed-a');
    const r2 = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r2.start(quiz, 'seed-b');
    expect(r1.orderedQuestions().map((q) => q.id)).not.toEqual(
      r2.orderedQuestions().map((q) => q.id),
    );
  });

  it('complete() returns aggregate result and is idempotent', async () => {
    const quiz = makeQuiz({
      passThreshold: 0.5,
      questions: [
        { id: 'q1', type: 'true_false', prompt: '?', correct: true, points: 2 },
        { id: 'q2', type: 'true_false', prompt: '?', correct: false, points: 1 },
      ],
    });
    const r = new QuizRuntime({ idGenerator: idGen, clock: () => 1 });
    r.start(quiz, 'seed');
    await r.answer('q1', true);
    await r.answer('q2', true);
    const result1 = r.complete();
    const result2 = r.complete();
    expect(result1.id).toBe(result2.id);
    expect(result1.totalScore).toBe(2);
    expect(result1.maxScore).toBe(3);
    expect(result1.passed).toBe(true);
    expect(result1.percentage).toBeCloseTo(2 / 3);
    expect(result1.answers.length).toBe(2);
  });

  it('attempts() returns answers in submission order', async () => {
    const quiz = makeQuiz({
      questions: [
        { id: 'q1', type: 'true_false', prompt: '?', correct: true },
        { id: 'q2', type: 'true_false', prompt: '?', correct: false },
      ],
    });
    const r = new QuizRuntime({
      idGenerator: idGen,
      clock: (() => {
        let t = 0;
        return () => (t += 100);
      })(),
    });
    r.start(quiz, 'seed');
    await r.answer('q2', false);
    await r.answer('q1', true);
    const order = r.attempts().map((a: QuizAnswer) => a.questionId);
    expect(order).toEqual(['q2', 'q1']);
  });
});
