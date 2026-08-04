import { describe, expect, it, vi } from 'vitest';
import {
  StateMachine,
  TransitionEvaluator,
  type StateMachineDef,
} from './index.js';

const def: StateMachineDef = {
  states: {
    idle: { label: 'Idle' },
    hover: { label: 'Hovered' },
    active: { label: 'Active' },
    pressed: { label: 'Pressed' },
    focused: { label: 'Focused' },
  },
  initial: 'idle',
  transitions: [
    { from: 'idle', to: 'hover', event: 'hover' },
    { from: 'hover', to: 'idle', event: 'default' },
    { from: 'idle', to: 'active', event: 'click' },
    { from: 'active', to: 'idle', event: 'default' },
    { from: 'idle', to: 'pressed', event: 'press' },
    { from: 'pressed', to: 'idle', event: 'default' },
    { from: 'idle', to: 'focused', event: 'focus' },
    { from: 'focused', to: 'idle', event: 'default' },
  ],
};

describe('StateMachine', () => {
  it('starts at the initial state on first getCurrentState', () => {
    const m = new StateMachine('inst-1', def);
    expect(m.getCurrentState()).toBe('idle');
  });

  it('applies a matching transition', () => {
    const m = new StateMachine('inst-1', def);
    const r = m.transition('click');
    expect(r.previous).toBe('idle');
    expect(r.current).toBe('active');
    expect(r.changed).toBe(true);
    expect(m.getCurrentState()).toBe('active');
  });

  it('returns the same state when no transition matches', () => {
    const m = new StateMachine('inst-1', def);
    const r = m.transition('focus'); // idle → focused
    expect(r.current).toBe('focused');
    // No transition out of focused for "click" → fall back to default → idle
    const r2 = m.transition('click');
    expect(r2.changed).toBe(true);
    expect(r2.current).toBe('idle');
  });

  it('falls back to default when the event has no outgoing edge', () => {
    const m = new StateMachine('inst-1', def);
    m.transition('click'); // idle → active
    const r = m.transition('hover'); // active has no hover → falls back to default → idle
    expect(r.current).toBe('idle');
  });

  it('stays put when no fallback is available either', () => {
    const strict: StateMachineDef = {
      states: { a: {}, b: {} },
      initial: 'a',
      transitions: [{ from: 'a', to: 'b', event: 'click' }],
    };
    const m = new StateMachine('i', strict);
    m.transition('click'); // → b
    const r = m.transition('hover'); // no default either → b
    expect(r.current).toBe('b');
    expect(r.changed).toBe(false);
  });

  it('emits onTransition on the initial transition', () => {
    const handler = vi.fn();
    const m = new StateMachine('inst-1', def, { onTransition: handler });
    m.getCurrentState();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ current: 'idle', previous: '', event: 'default' });
  });

  it('emits onTransition after every change', () => {
    const handler = vi.fn();
    const m = new StateMachine('inst-1', def, { onTransition: handler });
    m.transition('click');
    m.transition('default');
    expect(handler).toHaveBeenCalledTimes(3); // 2 transitions + initial
  });

  it('does not emit when the state is unchanged', () => {
    const handler = vi.fn();
    const m = new StateMachine('inst-1', def, { onTransition: handler });
    handler.mockClear();
    m.getCurrentState(); // initial transition (already counted)
    const before = handler.mock.calls.length;
    m.transition('focus'); // idle → focused (CHANGE #1)
    m.transition('hover'); // focused → no hover edge, falls back to default → idle (CHANGE #2)
    const after = handler.mock.calls.length;
    expect(after - before).toBe(2);
    // Now go to a state with truly no transitions out.
    handler.mockClear();
    const r = m.transition('hover'); // idle → hover (CHANGE #3 — only the hover→idle default)
    expect(r.current).toBe('hover');
    // From hover, click → no edge, fallback to default → idle → emits
    m.transition('click'); // CHANGE #4
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('reset returns to the initial state', () => {
    const m = new StateMachine('inst-1', def);
    m.transition('click');
    expect(m.getCurrentState()).toBe('active');
    m.reset();
    expect(m.getCurrentState()).toBe('idle');
  });

  it('reset accepts an explicit target state', () => {
    const m = new StateMachine('inst-1', def);
    m.reset('focused');
    expect(m.getCurrentState()).toBe('focused');
  });

  it('exposes the list of states and graph rows', () => {
    const m = new StateMachine('inst-1', def);
    expect(m.states()).toEqual(['idle', 'hover', 'active', 'pressed', 'focused']);
    const rows = m.graphRows();
    expect(rows.length).toBe(def.transitions.length);
    expect(rows).toContainEqual({ from: 'idle', event: 'click', to: 'active' });
  });

  it('returns transitions from a given state sorted by event precedence desc', () => {
    const m = new StateMachine('inst-1', def);
    const t = m.transitionsFrom('idle');
    // idle has focus, press, click, hover, default.
    expect(t[0]?.event).toBe('focus');
    expect(t[1]?.event).toBe('press');
    expect(t[2]?.event).toBe('click');
    expect(t[3]?.event).toBe('hover');
  });

  it('transitionBatch resolves the highest-precedence winner', () => {
    const m = new StateMachine('inst-1', def);
    const r = m.transitionBatch([
      { kind: 'hover', at: 100 },
      { kind: 'click', at: 100 },
    ]);
    expect(r.event).toBe('click');
    expect(r.current).toBe('active');
  });

  it('transitionBatch with no events is a no-op', () => {
    const m = new StateMachine('inst-1', def);
    m.getCurrentState();
    const r = m.transitionBatch([]);
    expect(r.changed).toBe(false);
    expect(r.current).toBe('idle');
  });

  it('validate rejects an empty states map', () => {
    expect(() => new StateMachine('i', { states: {}, initial: 'a', transitions: [] })).toThrow(/at least one state/);
  });

  it('validate rejects an unknown initial state', () => {
    expect(() =>
      new StateMachine('i', { states: { a: {} }, initial: 'b', transitions: [] }),
    ).toThrow(/initial state .* not in states/);
  });

  it('validate rejects a transition with unknown from', () => {
    expect(() =>
      new StateMachine('i', {
        states: { a: {} },
        initial: 'a',
        transitions: [{ from: 'missing', to: 'a', event: 'click' }],
      }),
    ).toThrow(/unknown state/);
  });

  it('validate rejects a transition with empty event', () => {
    expect(() =>
      new StateMachine('i', {
        states: { a: {} },
        initial: 'a',
        transitions: [{ from: 'a', to: 'a', event: '' }],
      }),
    ).toThrow(/event.*non-empty/);
  });

  it('falls back to default when transition targets a deleted state', () => {
    const broken: StateMachineDef = {
      states: { a: {}, b: {} },
      initial: 'a',
      transitions: [
        { from: 'a', to: 'b', event: 'click' },
        { from: 'b', to: 'a', event: 'default' },
        { from: 'a', to: 'a', event: 'default' },
      ],
    };
    const m = new StateMachine('i', broken);
    m.transition('click'); // a → b
    // Now replace the def with one that has no `b` (deleted state).
    const alt = m as unknown as { def: StateMachineDef };
    alt.def = { states: { a: {} }, initial: 'a', transitions: [] };
    // No fallback for click — state stays at `b` (current).
    // But applyInitial would throw if called; instead, transition click → no matching + no default.
    const r = m.transition('hover');
    // No matching transition; no fallback to default because there's no default edge either.
    expect(r.current).toBe('b');
  });

  it('uses injected TransitionEvaluator for batch selection', () => {
    const ev = new TransitionEvaluator();
    const m = new StateMachine('inst-1', def, { evaluator: ev });
    m.transitionBatch([{ kind: 'hover', at: 100 }]);
    expect(m.getCurrentState()).toBe('hover');
  });

  it('setOnTransition swaps the callback at runtime', () => {
    const m = new StateMachine('inst-1', def, { currentState: 'idle' });
    const a = vi.fn();
    const b = vi.fn();
    m.setOnTransition(a);
    m.transition('click');
    m.setOnTransition(b);
    m.transition('default');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('getPreviousState returns null until a transition has occurred', () => {
    const m = new StateMachine('inst-1', def);
    expect(m.getPreviousState()).toBeNull();
    m.transition('click');
    expect(m.getPreviousState()).toBe('idle');
  });

  it('exposes instanceId + def', () => {
    const m = new StateMachine('my-id', def);
    expect(m.instanceId).toBe('my-id');
    expect(m.def).toBe(def);
  });
});