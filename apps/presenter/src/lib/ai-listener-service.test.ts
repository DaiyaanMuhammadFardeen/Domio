/**
 * AI listener service tests — Wave 11 §S11.10.
 *
 * Exercises the in-memory pattern store, match recording, and the
 * pure scoring helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_QUESTION_PATTERNS,
  findBestMatch,
  listMatchedQuestions,
  listQuestionPatterns,
  recordMatchedQuestionForSession,
  resetMatchedQuestions,
  resolveSlideTitle,
  saveQuestionPatterns,
  scoreMatch,
  setPatternEnabled,
  updateMatchStatus,
  type MatchedQuestion,
  type QuestionPattern,
} from './ai-listener-service';

function makeMatch(overrides: Partial<MatchedQuestion> = {}): MatchedQuestion {
  return {
    id: `m-${Math.random().toString(36).slice(2, 10)}`,
    timestamp_ms: Date.now(),
    question: 'what about churn?',
    matched_pattern_id: 'pat-churn',
    slide_id: 'churn-deck',
    slide_title: 'Churn deep dive',
    relevance: 0.92,
    status: 'pending',
    ...overrides,
  };
}

describe('ai-listener-service', () => {
  beforeEach(async () => {
    resetMatchedQuestions();
    // Restore the default pattern set so tests don't bleed into each other.
    await saveQuestionPatterns(DEFAULT_QUESTION_PATTERNS.map((p) => ({ ...p })));
  });

  describe('listQuestionPatterns', () => {
    it('returns the four default patterns', async () => {
      const patterns = await listQuestionPatterns();
      expect(patterns).toHaveLength(DEFAULT_QUESTION_PATTERNS.length);
      expect(patterns.map((p) => p.id)).toEqual([
        'pat-churn',
        'pat-revenue',
        'pat-retention',
        'pat-qoq',
      ]);
    });

    it('returns a defensive copy (mutating the result does not change the store)', async () => {
      const patterns = await listQuestionPatterns();
      patterns[0]!.enabled = false;
      const fresh = await listQuestionPatterns();
      expect(fresh[0]!.enabled).toBe(true);
    });
  });

  describe('saveQuestionPatterns', () => {
    it('replaces the entire list and returns the new list', async () => {
      const next: QuestionPattern[] = [
        {
          id: 'pat-custom',
          pattern: 'pricing please',
          slide_id: 'pricing',
          relevance: 0.8,
          enabled: true,
        },
      ];
      const saved = await saveQuestionPatterns(next);
      expect(saved).toHaveLength(1);
      const fresh = await listQuestionPatterns();
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.id).toBe('pat-custom');
    });

    it('clones inputs so later mutations do not leak into the store', async () => {
      const input: QuestionPattern[] = [
        {
          id: 'pat-x',
          pattern: 'foo',
          slide_id: 'slide-x',
          relevance: 0.5,
          enabled: true,
        },
      ];
      await saveQuestionPatterns(input);
      input[0]!.enabled = false;
      const fresh = await listQuestionPatterns();
      expect(fresh[0]!.enabled).toBe(true);
    });
  });

  describe('setPatternEnabled', () => {
    it('updates an existing pattern and returns the new record', async () => {
      const updated = await setPatternEnabled('pat-churn', false);
      expect(updated?.enabled).toBe(false);
      const fresh = await listQuestionPatterns();
      const churn = fresh.find((p) => p.id === 'pat-churn');
      expect(churn?.enabled).toBe(false);
    });

    it('returns null when the pattern does not exist', async () => {
      const updated = await setPatternEnabled('does-not-exist', true);
      expect(updated).toBeNull();
    });
  });

  describe('resolveSlideTitle', () => {
    it('maps known slide ids to titles', () => {
      expect(resolveSlideTitle('churn-deck')).toBe('Churn deep dive');
      expect(resolveSlideTitle('revenue-q3')).toBe('Revenue (Q3)');
    });

    it('falls back to the slide id when unmapped', () => {
      expect(resolveSlideTitle('unknown-slide')).toBe('unknown-slide');
    });
  });

  describe('recordMatchedQuestionForSession / listMatchedQuestions', () => {
    it('records matches in insertion order per session', async () => {
      const sessionId = 'sess-1';
      await recordMatchedQuestionForSession(sessionId, makeMatch({ id: 'm1' }));
      await recordMatchedQuestionForSession(sessionId, makeMatch({ id: 'm2' }));
      await recordMatchedQuestionForSession(sessionId, makeMatch({ id: 'm3' }));

      const list = await listMatchedQuestions(sessionId);
      expect(list.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('returns an empty list for an unknown session', async () => {
      const list = await listMatchedQuestions('never-touched');
      expect(list).toEqual([]);
    });

    it('isolates matches between sessions', async () => {
      await recordMatchedQuestionForSession('s-a', makeMatch({ id: 'ma' }));
      await recordMatchedQuestionForSession('s-b', makeMatch({ id: 'mb' }));
      const a = await listMatchedQuestions('s-a');
      const b = await listMatchedQuestions('s-b');
      expect(a.map((m) => m.id)).toEqual(['ma']);
      expect(b.map((m) => m.id)).toEqual(['mb']);
    });
  });

  describe('updateMatchStatus', () => {
    it('transitions pending → accepted', async () => {
      const sessionId = 'sess-1';
      await recordMatchedQuestionForSession(sessionId, makeMatch({ id: 'm1' }));
      const updated = await updateMatchStatus(sessionId, 'm1', 'accepted');
      expect(updated?.status).toBe('accepted');
      const list = await listMatchedQuestions(sessionId);
      expect(list[0]!.status).toBe('accepted');
    });

    it('transitions pending → dismissed', async () => {
      const sessionId = 'sess-1';
      await recordMatchedQuestionForSession(sessionId, makeMatch({ id: 'm1' }));
      const updated = await updateMatchStatus(sessionId, 'm1', 'dismissed');
      expect(updated?.status).toBe('dismissed');
    });

    it('returns null when the session or match does not exist', async () => {
      const missing = await updateMatchStatus('nope', 'nope', 'accepted');
      expect(missing).toBeNull();
    });
  });

  describe('scoreMatch', () => {
    it('returns the pattern relevance on a case-insensitive substring match', () => {
      const pattern = DEFAULT_QUESTION_PATTERNS[0]!;
      expect(scoreMatch('What about churn?', pattern)).toBeCloseTo(0.92, 5);
      expect(scoreMatch('Someone asked: WHAT ABOUT CHURN?', pattern)).toBeCloseTo(0.92, 5);
    });

    it('returns 0 when the transcript does not contain the pattern', () => {
      const pattern = DEFAULT_QUESTION_PATTERNS[0]!;
      expect(scoreMatch('pricing please', pattern)).toBe(0);
    });

    it('returns 0 for disabled patterns', () => {
      const pattern: QuestionPattern = { ...DEFAULT_QUESTION_PATTERNS[0]!, enabled: false };
      expect(scoreMatch('what about churn?', pattern)).toBe(0);
    });

    it('returns 0 for empty transcripts', () => {
      const pattern = DEFAULT_QUESTION_PATTERNS[0]!;
      expect(scoreMatch('', pattern)).toBe(0);
    });
  });

  describe('findBestMatch', () => {
    it('returns the highest-scoring pattern', () => {
      const patterns = DEFAULT_QUESTION_PATTERNS;
      const best = findBestMatch(
        'Could you show me the revenue breakdown?',
        patterns,
      );
      expect(best?.pattern.id).toBe('pat-revenue');
    });

    it('returns null when nothing matches', () => {
      const best = findBestMatch('totally unrelated topic', DEFAULT_QUESTION_PATTERNS);
      expect(best).toBeNull();
    });

    it('skips disabled patterns', async () => {
      await setPatternEnabled('pat-churn', false);
      const patterns = await listQuestionPatterns();
      const best = findBestMatch('what about churn?', patterns);
      expect(best?.pattern.id).not.toBe('pat-churn');
    });
  });
});
