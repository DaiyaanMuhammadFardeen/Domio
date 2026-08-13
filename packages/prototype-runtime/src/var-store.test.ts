/**
 * VarStore tests — scope ladder, Object.is change detection, snapshot/restore.
 */

import { describe, expect, it } from 'vitest';
import { VarStore, scopeLadder } from './var-store.js';

describe('VarStore', () => {
  it('reads through the scope ladder', () => {
    const s = new VarStore();
    s.write('x', 'deck-default', { scope: 'deck' });
    s.write('x', 'session-override', { scope: 'session' });
    expect(s.read('x')).toBe('session-override');
  });

  it('exactScope read bypasses ladder', () => {
    const s = new VarStore();
    s.write('x', 'deck-default', { scope: 'deck' });
    s.write('x', 'session-override', { scope: 'session' });
    expect(s.read('x', { exactScope: 'deck' })).toBe('deck-default');
  });

  it('uppercases keys', () => {
    const s = new VarStore();
    s.write('pricingTier', 'annual', { scope: 'deck' });
    expect(s.read('PRICINGTIER')).toBe('annual');
    expect(s.read('pricingtier')).toBe('annual');
  });

  it('returns null for unset vars rather than undefined', () => {
    const s = new VarStore();
    expect(s.read('nope')).toBe(null);
  });

  it('does not notify subscribers on no-op writes (Object.is)', () => {
    const s = new VarStore();
    s.write('x', 1, { scope: 'deck' });
    let count = 0;
    s.subscribe('x', () => count++);
    expect(s.write('x', 1, { scope: 'deck' })).toBe(false);
    expect(count).toBe(0);
    expect(s.write('x', 2, { scope: 'deck' })).toBe(true);
    expect(count).toBe(1);
  });

  it('subscribers see previous and next', () => {
    const s = new VarStore();
    const seen: unknown[] = [];
    s.subscribe('x', (e) => seen.push([e.previous, e.next]));
    s.write('x', 1, { scope: 'deck' });
    s.write('x', 2, { scope: 'deck' });
    expect(seen).toEqual([
      [null, 1],
      [1, 2],
    ]);
  });

  it('subscribeAll sees every change', () => {
    const s = new VarStore();
    const seen: string[] = [];
    s.subscribeAll((e) => seen.push(e.name));
    s.write('a', 1, { scope: 'deck' });
    s.write('b', 2, { scope: 'session' });
    expect(seen).toEqual(['A', 'B']);
  });

  it('subscriber exceptions are swallowed', () => {
    const s = new VarStore();
    s.subscribe('x', () => {
      throw new Error('boom');
    });
    expect(() => s.write('x', 1, { scope: 'deck' })).not.toThrow();
  });

  it('unsubscribe stops notifications', () => {
    const s = new VarStore();
    let count = 0;
    const off = s.subscribe('x', () => count++);
    s.write('x', 1, { scope: 'deck' });
    off();
    s.write('x', 2, { scope: 'deck' });
    expect(count).toBe(1);
  });

  it('snapshot + restore round-trip', () => {
    const s = new VarStore();
    s.write('x', 42, { scope: 'session' });
    const snap = s.snapshot('session');
    s.write('x', 99, { scope: 'session' });
    s.restore(snap);
    expect(s.read('x')).toBe(42);
  });

  it('reset clears all scopes and notifies wildcard', () => {
    const s = new VarStore();
    s.write('x', 1, { scope: 'deck' });
    let count = 0;
    s.subscribeAll(() => count++);
    s.reset();
    expect(count).toBeGreaterThan(0);
    expect(s.read('x')).toBe(null);
  });

  it('hydrate sets multiple defaults silently', () => {
    const s = new VarStore();
    let count = 0;
    s.subscribeAll(() => count++);
    s.hydrate('deck', { X: 1, Y: 2 });
    expect(s.read('x')).toBe(1);
    expect(count).toBe(0);
  });

  it('scopeLadder orders low → high by spec', () => {
    expect(scopeLadder()).toEqual(['viewer', 'session', 'component_instance', 'slide', 'deck']);
    expect(scopeLadder('slide')).toEqual(['slide', 'deck']);
    expect(scopeLadder('deck')).toEqual(['deck']);
  });

  it('write to lower scope does not affect higher read (write is per-scope)', () => {
    const s = new VarStore();
    s.write('x', 'deck-default', { scope: 'deck' });
    s.write('x', 'viewer', { scope: 'viewer' });
    expect(s.read('x', { exactScope: 'deck' })).toBe('deck-default');
    expect(s.read('x', { exactScope: 'viewer' })).toBe('viewer');
  });

  it('namesInScope returns only names defined in that scope', () => {
    const s = new VarStore();
    s.write('x', 1, { scope: 'deck' });
    s.write('y', 2, { scope: 'session' });
    expect(s.namesInScope('deck').sort()).toEqual(['X']);
    expect(s.namesInScope('session').sort()).toEqual(['Y']);
  });

  it('allNames returns the union of all scopes', () => {
    const s = new VarStore();
    s.write('x', 1, { scope: 'deck' });
    s.write('y', 2, { scope: 'session' });
    expect(s.allNames().sort()).toEqual(['X', 'Y']);
  });

  it('define via Variable hydrates default value silently', () => {
    const s = new VarStore();
    let count = 0;
    s.subscribeAll(() => count++);
    s.define({
      id: 'v1',
      tenantId: 't1',
      deckId: 'd1',
      name: 'TIER',
      scope: 'deck',
      type: 'string',
      defaultValue: 'monthly',
      visibility: 'deck_public',
      readOnly: false,
      version: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(s.read('TIER')).toBe('monthly');
    expect(count).toBe(0);
  });
});
