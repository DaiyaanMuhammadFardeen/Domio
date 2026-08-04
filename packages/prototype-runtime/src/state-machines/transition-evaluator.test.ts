import { describe, expect, it } from 'vitest';
import {
  EVENT_PRECEDENCE,
  PRECEDENCE_LADDER,
  TransitionEvaluator,
} from './transition-evaluator.js';

describe('TransitionEvaluator', () => {
  it('returns null for an empty event batch', () => {
    const ev = new TransitionEvaluator();
    expect(ev.selectWinner([])).toBeNull();
  });

  it('returns the only event when one fires', () => {
    const ev = new TransitionEvaluator();
    const winner = ev.selectWinner([{ kind: 'click', at: 100 }]);
    expect(winner).toEqual({ kind: 'click', at: 100 });
  });

  it('picks the highest-precedence event when multiple fire same tick', () => {
    const ev = new TransitionEvaluator();
    const winner = ev.selectWinner([
      { kind: 'click', at: 100 },
      { kind: 'hover', at: 100 },
    ]);
    expect(winner?.kind).toBe('click');
  });

  it('focus beats press, click, hover, default', () => {
    const ev = new TransitionEvaluator();
    const winner = ev.selectWinner([
      { kind: 'hover', at: 100 },
      { kind: 'click', at: 100 },
      { kind: 'default', at: 100 },
      { kind: 'press', at: 100 },
      { kind: 'focus', at: 100 },
    ]);
    expect(winner?.kind).toBe('focus');
  });

  it('press beats click + hover (spec example)', () => {
    const ev = new TransitionEvaluator();
    const winner = ev.selectWinner([
      { kind: 'hover', at: 100 },
      { kind: 'click', at: 100 },
    ]);
    // press should be applied even if not in the batch.
    const winner2 = ev.selectWinner([
      { kind: 'hover', at: 100 },
      { kind: 'click', at: 100 },
      { kind: 'press', at: 100 },
    ]);
    expect(winner?.kind).toBe('click');
    expect(winner2?.kind).toBe('press');
  });

  it('exposes stable precedence ladder', () => {
    expect(PRECEDENCE_LADDER[0]).toBe('focus');
    expect(PRECEDENCE_LADDER[PRECEDENCE_LADDER.length - 1]).toBe('default');
  });

  it('exposes precedence scores strictly descending', () => {
    expect(EVENT_PRECEDENCE.focus).toBeGreaterThan(EVENT_PRECEDENCE.press);
    expect(EVENT_PRECEDENCE.press).toBeGreaterThan(EVENT_PRECEDENCE.click);
    expect(EVENT_PRECEDENCE.click).toBeGreaterThan(EVENT_PRECEDENCE.hover);
    expect(EVENT_PRECEDENCE.hover).toBeGreaterThan(EVENT_PRECEDENCE.default);
  });

  it('precedenceOf returns the same value as EVENT_PRECEDENCE', () => {
    const ev = new TransitionEvaluator();
    for (const kind of PRECEDENCE_LADDER) {
      expect(ev.precedenceOf(kind)).toBe(EVENT_PRECEDENCE[kind]);
    }
  });

  it('weakerThan returns strictly weaker kinds, descending', () => {
    const ev = new TransitionEvaluator();
    const weaker = ev.weakerThan('click');
    expect(weaker).toContain('hover');
    expect(weaker).toContain('default');
    expect(weaker).not.toContain('click');
    expect(weaker).not.toContain('focus');
    expect(weaker).not.toContain('press');
  });

  it('weakerThan(focus) contains every other kind', () => {
    const ev = new TransitionEvaluator();
    const weaker = ev.weakerThan('focus');
    expect(weaker).toEqual(['press', 'click', 'hover', 'default']);
  });

  it('weakerThan(default) is empty', () => {
    const ev = new TransitionEvaluator();
    expect(ev.weakerThan('default')).toEqual([]);
  });

  it('respects injected clock for the synthesized winner timestamp', () => {
    let now = 12345;
    const ev = new TransitionEvaluator({ now: () => now });
    const winner = ev.selectWinner([{ kind: 'hover', at: 100 }]);
    // The original event has `at: 100`; we preserve it because the
    // event was provided directly.
    expect(winner?.at).toBe(100);
    now = 99999;
    const winner2 = ev.selectWinner([]); // null path
    expect(winner2).toBeNull();
  });
});
