import { describe, expect, it } from 'vitest';
import { PARTICIPATION_WIDGETS, findWidget } from './widget-defs';

describe('participation widget palette', () => {
  it('exposes 8 widget types', () => {
    expect(PARTICIPATION_WIDGETS).toHaveLength(8);
  });

  it('has a unique label per widget', () => {
    const labels = new Set(PARTICIPATION_WIDGETS.map((w) => w.label));
    expect(labels.size).toBe(PARTICIPATION_WIDGETS.length);
  });

  it('every widget has a defaultProps object', () => {
    for (const w of PARTICIPATION_WIDGETS) {
      expect(w.defaultProps).toBeDefined();
      expect(Object.keys(w.defaultProps).length).toBeGreaterThan(0);
    }
  });

  it('every widget has an emoji', () => {
    for (const w of PARTICIPATION_WIDGETS) {
      expect(w.emoji.length).toBeGreaterThan(0);
    }
  });

  it('findWidget returns the right entry', () => {
    expect(findWidget('poll')?.label).toBe('Poll');
    expect(findWidget('quiz')?.emoji).toBe('🧠');
    expect(findWidget('missing')).toBeUndefined();
  });

  it('every widget type matches an audience type', () => {
    const valid = new Set([
      'poll', 'word_cloud', 'qa', 'quiz',
      'reaction', 'nav_vote', 'sentiment', 'raise_hand',
    ]);
    for (const w of PARTICIPATION_WIDGETS) {
      expect(valid.has(w.type)).toBe(true);
    }
  });
});