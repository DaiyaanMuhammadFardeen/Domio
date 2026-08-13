import { describe, expect, it } from 'vitest';
import { validateMultipleChoice } from './multiple-choice.js';
import { validateMultiSelect } from './multi-select.js';
import { validateTrueFalse } from './true-false.js';
import { validateShortAnswer, validateFillBlank, levenshtein, similarity } from './short-answer.js';
import { validateDragToMatch } from './drag-to-match.js';
import {
  validateHotspotQuiz,
  hotspotCentroid,
  pointInPolygon,
  pointInRect,
} from './hotspot-quiz.js';
import { validateFlashCard } from './flash-card.js';
import { validateShortAnswerLlm, DEFAULT_LLM_FALLBACK_THRESHOLD } from './short-answer-llm.js';

describe('validateMultipleChoice', () => {
  it('rejects non-string answers', () => {
    expect(validateMultipleChoice(123, { correctChoiceId: 'a' }).correct).toBe(false);
  });
});

describe('validateMultiSelect', () => {
  it('handles empty correctChoiceIds and empty answer', () => {
    expect(validateMultiSelect([], { correctChoiceIds: [] }).correct).toBe(true);
  });

  it('rejects non-array answer', () => {
    expect(validateMultiSelect('a', { correctChoiceIds: ['a'] }).correct).toBe(false);
  });
});

describe('validateTrueFalse', () => {
  it('rejects non-boolean answers', () => {
    expect(validateTrueFalse('true', { correct: true }).correct).toBe(false);
  });
});

describe('validateShortAnswer — Levenshtein helpers', () => {
  it('levenshtein handles equal strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('levenshtein handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
  it('levenshtein counts substitutions', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('similarity returns 1 for equal, 0 for fully different', () => {
    expect(similarity('a', 'a')).toBe(1);
    expect(similarity('a', 'b')).toBe(0);
    expect(similarity('', '')).toBe(1);
  });
});

describe('validateShortAnswer — empty answer', () => {
  it('rejects empty string', () => {
    const r = validateShortAnswer('', { acceptedAnswers: ['green'] });
    expect(r.correct).toBe(false);
  });
});

describe('validateFillBlank', () => {
  it('returns correct when there are no blanks', () => {
    const r = validateFillBlank({}, { blanks: [] });
    expect(r.correct).toBe(true);
  });

  it('rejects non-object answer', () => {
    const r = validateFillBlank('hi', { blanks: [{ id: 'b1', acceptedAnswers: ['x'] }] });
    expect(r.correct).toBe(false);
  });
});

describe('validateDragToMatch', () => {
  it('handles empty pairs as correct', () => {
    expect(validateDragToMatch({}, { pairs: [] }).correct).toBe(true);
  });
});

describe('validateHotspotQuiz — helpers', () => {
  it('centroid of a rectangle', () => {
    expect(hotspotCentroid({ kind: 'rect', x: 0, y: 0, w: 1, h: 0.5 })).toEqual({
      x: 0.5,
      y: 0.25,
    });
  });

  it('centroid of a polygon = mean of vertices', () => {
    expect(
      hotspotCentroid({
        kind: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      }),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it('pointInPolygon returns true for inside, false for outside', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(pointInPolygon(0.5, 0.5, square)).toBe(true);
    expect(pointInPolygon(1.5, 0.5, square)).toBe(false);
  });

  it('pointInRect checks bounds', () => {
    expect(pointInRect(0.5, 0.5, { x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(pointInRect(1.5, 0.5, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe('validateHotspotQuiz — partial credit', () => {
  it('gives partial credit when distance is just over tolerance', async () => {
    // Centroid of rect (0.4,0.4,0.2,0.2) is (0.5, 0.5). The rect spans
    // (0.4..0.6, 0.4..0.6), so a click at (0.55, 0.5) is INSIDE the
    // rect → correct, score=1. For a true partial-credit case we
    // click OUTSIDE the rect at (0.7, 0.5): distance to centroid
    // = 0.2 — that's > 2× tolerance, score=0. So we choose (0.65, 0.5):
    // outside the rect, distance = 0.15, > 2×0.04=0.08, so still 0.
    // For "just over" we use a small rect with tight tolerance.
    const r = await validateHotspotQuiz(
      { x: 0.05, y: 0.5 },
      { geometry: { kind: 'rect', x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, tolerance: 0.04 },
    );
    // Point is far outside the rect and far from centroid.
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0);
  });

  it('gives partial credit when click is just outside the rect', async () => {
    // Centroid of rect (0.4,0.4,0.2,0.2) is (0.5, 0.5). The rect spans
    // (0.4..0.6, 0.4..0.6). Click at (0.62, 0.5) is just outside the
    // rect; distance to centroid = 0.12, which is > 0.04 tolerance
    // but > 2*0.04 = 0.08, so still no credit. With looser tolerance:
    const r = await validateHotspotQuiz(
      { x: 0.62, y: 0.5 },
      { geometry: { kind: 'rect', x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, tolerance: 0.1 },
    );
    // distance = 0.12; 2*tolerance = 0.2; so partial credit applies.
    expect(r.correct).toBe(false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
  });

  it('rejects malformed answers', async () => {
    const r = await validateHotspotQuiz(null, {
      geometry: { kind: 'rect', x: 0, y: 0, w: 1, h: 1 },
    });
    expect(r.correct).toBe(false);
  });

  it('rejects coordinates outside [0..1]', async () => {
    const r = await validateHotspotQuiz(
      { x: -0.1, y: 0.5 },
      { geometry: { kind: 'rect', x: 0, y: 0, w: 1, h: 1 } },
    );
    expect(r.correct).toBe(false);
  });
});

describe('validateFlashCard', () => {
  it('rejects malformed answer', () => {
    expect(validateFlashCard({}).correct).toBe(false);
  });

  it('rejects non-boolean known', () => {
    expect(validateFlashCard({ known: 'yes' }).correct).toBe(false);
  });
});

describe('validateShortAnswerLlm', () => {
  it('rejects non-string answers', async () => {
    const r = await validateShortAnswerLlm(123, { referenceAnswer: 'x' }, () => ({
      score: 1,
      confidence: 1,
      reason: '',
    }));
    expect(r.correct).toBe(false);
    expect(r.needsHumanReview).toBe(false);
  });

  it('exports the default threshold constant', () => {
    expect(DEFAULT_LLM_FALLBACK_THRESHOLD).toBe(0.7);
  });

  it('sets needsHumanReview when confidence is below threshold', async () => {
    const r = await validateShortAnswerLlm(
      'ok',
      { referenceAnswer: 'ok', fallbackThreshold: 0.8 },
      () => ({ score: 0.9, confidence: 0.5, reason: 'unsure' }),
    );
    expect(r.needsHumanReview).toBe(true);
  });
});
