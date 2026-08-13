/**
 * ActionExecutor tests — handler registration, dispatch, defaults.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  ActionExecutor,
  UnknownActionError,
  defaultActionHandlers,
  __clearHostListeners,
  addHostListener,
} from './action-executor.js';
import { VarStore } from './var-store.js';
import type { ActionKind } from './types.js';

describe('ActionExecutor', () => {
  beforeEach(() => {
    __clearHostListeners();
  });

  it('dispatches to registered handlers', async () => {
    const ex = new ActionExecutor();
    let called = 0;
    ex.register('show', () => {
      called++;
    });
    await ex.execute({ kind: 'show', params: { targetId: 'el' } });
    expect(called).toBe(1);
  });

  it('throws UnknownActionError for unregistered kinds', async () => {
    const ex = new ActionExecutor();
    await expect(ex.execute({ kind: 'show', params: {} })).rejects.toBeInstanceOf(
      UnknownActionError,
    );
  });

  it('has() reports registered kinds', () => {
    const ex = new ActionExecutor();
    ex.register('hide', () => {});
    expect(ex.has('hide')).toBe(true);
    expect(ex.has('show')).toBe(false);
  });

  it('defaultActionHandlers.set_variable writes to the store', () => {
    const store = new VarStore();
    const handlers = defaultActionHandlers(store);
    handlers.set_variable!({ name: 'TIER', value: 'annual', scope: 'deck' });
    expect(store.read('TIER')).toBe('annual');
  });

  it('defaultActionHandlers.set_variable defaults to deck scope', () => {
    const store = new VarStore();
    const handlers = defaultActionHandlers(store);
    handlers.set_variable!({ name: 'X', value: 42 });
    expect(store.read('X', { exactScope: 'deck' })).toBe(42);
  });

  it('defaultActionHandlers.navigate_to fires host event', () => {
    const seen: unknown[] = [];
    addHostListener('action:navigate_to', (d) => seen.push(d));
    const store = new VarStore();
    const handlers = defaultActionHandlers(store);
    handlers.navigate_to!({ slideId: 's5' });
    expect(seen).toEqual([{ slideId: 's5' }]);
  });

  it('defaultActionHandlers.show / hide / enable / disable fire host events', () => {
    const events: string[] = [];
    addHostListener('action:show', () => events.push('show'));
    addHostListener('action:hide', () => events.push('hide'));
    addHostListener('action:enable', () => events.push('enable'));
    addHostListener('action:disable', () => events.push('disable'));
    const handlers = defaultActionHandlers(new VarStore());
    handlers.show!({ targetId: 'el' });
    handlers.hide!({ targetId: 'el' });
    handlers.enable!({ targetId: 'el' });
    handlers.disable!({ targetId: 'el' });
    expect(events.sort()).toEqual(['disable', 'enable', 'hide', 'show']);
  });

  it('all 10 ActionKind handlers are present in defaults', () => {
    const handlers = defaultActionHandlers(new VarStore());
    const required: ActionKind[] = [
      'show',
      'hide',
      'enable',
      'disable',
      'set_variable',
      'navigate_to',
      'play_animation',
      'submit_form',
      'open_overlay',
      'close_overlay',
    ];
    for (const k of required) expect(handlers[k]).toBeDefined();
  });

  it('unregister removes a handler', () => {
    const ex = new ActionExecutor();
    ex.register('show', () => {});
    ex.unregister('show');
    expect(ex.has('show')).toBe(false);
  });

  it('addHostListener unsubscribes correctly', () => {
    let count = 0;
    const off = addHostListener('action:show', () => count++);
    off();
    const handlers = defaultActionHandlers(new VarStore());
    handlers.show!({ targetId: 'el' });
    expect(count).toBe(0);
  });
});
