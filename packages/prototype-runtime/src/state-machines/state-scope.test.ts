import { describe, expect, it } from 'vitest';
import {
  StateMachine,
  StateScope,
  type StateMachineDef,
} from './index.js';

const def: StateMachineDef = {
  states: { idle: {}, active: {} },
  initial: 'idle',
  transitions: [
    { from: 'idle', to: 'active', event: 'click' },
    { from: 'active', to: 'idle', event: 'default' },
  ],
};

function makeMachine(id: string, currentState?: string): StateMachine {
  return new StateMachine(id, def, {
    ...(currentState !== undefined ? { currentState } : {}),
  });
}

describe('StateScope', () => {
  it('attaches a machine and snapshots + restores', () => {
    const scope = new StateScope();
    const m = makeMachine('i');
    scope.attach(m, { scope: 'session' });
    scope.snapshot('session');
    m.transition('click');
    expect(m.getCurrentState()).toBe('active');
    const snap = scope.snapshot('session');
    expect(snap.records).toHaveLength(1);
    expect(snap.records[0]?.state).toBe('active');
    m.transition('default'); // back to idle
    const restored = scope.restore(snap);
    expect(restored).toBe(1);
    expect(m.getCurrentState()).toBe('active');
  });

  it('resetOnSlideEnter only resets slide-scoped machines without persist flag', () => {
    const scope = new StateScope();
    const m1 = makeMachine('slide-1');
    const m2 = makeMachine('slide-2', 'active');
    const m3 = makeMachine('deck-1', 'active');
    const m4 = makeMachine('persistent-1', 'active');
    scope.attach(m1, { scope: 'slide' });
    scope.attach(m2, { scope: 'slide', persistInstanceState: true });
    scope.attach(m3, { scope: 'deck' });
    scope.attach(m4, { scope: 'persistent_session' });

    const reset = scope.resetOnSlideEnter();
    expect(reset).toEqual(['slide-1']);
    expect(m1.getCurrentState()).toBe('idle');
    expect(m2.getCurrentState()).toBe('active'); // persist flag
    expect(m3.getCurrentState()).toBe('active');
    expect(m4.getCurrentState()).toBe('active');
  });

  it('resetOnSlideEnter accepts an explicit list of instanceIds', () => {
    const scope = new StateScope();
    const a = makeMachine('a', 'active');
    const b = makeMachine('b', 'active');
    scope.attach(a, { scope: 'slide' });
    scope.attach(b, { scope: 'slide' });
    const reset = scope.resetOnSlideEnter(['a']);
    expect(reset).toEqual(['a']);
    expect(a.getCurrentState()).toBe('idle');
    expect(b.getCurrentState()).toBe('active');
  });

  it('setPersistInstanceState flips the flag', () => {
    const scope = new StateScope();
    const m = makeMachine('i', 'active');
    scope.attach(m, { scope: 'slide' });
    scope.setPersistInstanceState('i', true);
    expect(scope.resetOnSlideEnter()).toEqual([]);
    expect(m.getCurrentState()).toBe('active');
  });

  it('setPersistInstanceState throws for unknown instanceId', () => {
    const scope = new StateScope();
    expect(() => scope.setPersistInstanceState('nope', true)).toThrow(/unknown instanceId/);
  });

  it('attaching the same instanceId twice replaces the previous binding', () => {
    const scope = new StateScope();
    const m = makeMachine('i');
    scope.attach(m, { scope: 'session' });
    const m2 = makeMachine('i');
    const detach = scope.attach(m2, { scope: 'deck' });
    // The second attach replaces the first by instanceId; detach clears both.
    expect(scope.size()).toBe(1);
    detach();
    expect(scope.size()).toBe(0);
  });

  it('snapshot only includes the requested scope', () => {
    const scope = new StateScope();
    const a = makeMachine('a');
    const b = makeMachine('b');
    scope.attach(a, { scope: 'session' });
    scope.attach(b, { scope: 'deck' });
    const snap = scope.snapshot('session');
    expect(snap.records).toHaveLength(1);
    expect(snap.records[0]?.instanceId).toBe('a');
    expect(snap.scope).toBe('session');
  });

  it('restore ignores records for un-bound machines', () => {
    const scope = new StateScope();
    const snap = {
      scope: 'session' as const,
      takenAt: 0,
      records: [
        {
          instanceId: 'missing',
          state: 'idle',
          scope: 'session' as const,
          persistInstanceState: false,
          at: 0,
        },
      ],
    };
    expect(scope.restore(snap)).toBe(0);
  });

  it('recordFor returns the current record or null', () => {
    const scope = new StateScope();
    const m = makeMachine('i');
    scope.attach(m, { scope: 'session' });
    const r = scope.recordFor('i', 'session');
    expect(r?.state).toBe('idle');
    expect(scope.recordFor('i', 'deck')).toBeNull();
  });

  it('write/read manually persists records', () => {
    const scope = new StateScope();
    scope.write({
      instanceId: 'a',
      state: 'active',
      scope: 'session',
      persistInstanceState: false,
      at: 123,
    });
    const r = scope.read('a', 'session');
    expect(r?.state).toBe('active');
    expect(r?.at).toBe(123);
  });

  it('clear drops every record', () => {
    const scope = new StateScope();
    scope.write({
      instanceId: 'a',
      state: 'active',
      scope: 'session',
      persistInstanceState: false,
      at: 0,
    });
    scope.clear();
    expect(scope.read('a', 'session')).toBeNull();
  });

  it('detach returns an unsubscribe that removes the binding', () => {
    const scope = new StateScope();
    const m = makeMachine('i');
    const detach = scope.attach(m, { scope: 'session' });
    expect(scope.size()).toBe(1);
    detach();
    expect(scope.size()).toBe(0);
  });

  it('scope.resetOnSlideEnter is a no-op for empty scope', () => {
    const scope = new StateScope();
    expect(scope.resetOnSlideEnter()).toEqual([]);
  });
});