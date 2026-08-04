/**
 * OverlayStack tests — depth limit, last-opened-on-top, invoker tracking.
 */

import { describe, expect, it } from 'vitest';
import { OverlayStack, OverlayStackFullError, OverlayNotOpenError, OVERLAY_MAX_DEPTH } from './stack.js';
import type { Overlay } from '../types.js';

function overlay(id: string): Overlay {
  return {
    id,
    tenantId: 't1',
    deckId: 'd1',
    slideId: 's1',
    name: id,
    type: 'modal',
    sizeStrategy: 'medium',
    anchor: null,
    openTrigger: null,
    closeTrigger: null,
    persistent: false,
    schema: {},
    version: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('OverlayStack', () => {
  it('opens and tracks invokers', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'), 'btn-1');
    expect(s.size()).toBe(1);
    expect(s.topmost()?.id).toBe('a');
  });

  it('closeTopmost returns invoker id for focus restoration', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'), 'btn-1');
    s.openOverlay(overlay('b'), 'btn-2');
    const r = s.closeTopmost();
    expect(r?.overlay.id).toBe('b');
    expect(r?.invokerId).toBe('btn-2');
    expect(s.size()).toBe(1);
  });

  it('closeTopmost returns null on empty stack', () => {
    const s = new OverlayStack();
    expect(s.closeTopmost()).toBe(null);
  });

  it('closeById removes from middle of stack', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'), 'inv-a');
    s.openOverlay(overlay('b'), 'inv-b');
    s.openOverlay(overlay('c'), 'inv-c');
    const r = s.closeById('b');
    expect(r?.overlay.id).toBe('b');
    expect(r?.invokerId).toBe('inv-b');
    expect(s.size()).toBe(2);
  });

  it('closeById throws OverlayNotOpenError for unknown id', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'), 'inv');
    expect(() => s.closeById('unknown')).toThrow(OverlayNotOpenError);
  });

  it('rejects the 6th open (max_depth=5)', () => {
    const s = new OverlayStack();
    for (let i = 0; i < OVERLAY_MAX_DEPTH; i++) {
      s.openOverlay(overlay(`o${i}`), `inv${i}`);
    }
    expect(() => s.openOverlay(overlay('overflow'), 'inv')).toThrow(OverlayStackFullError);
  });

  it('isOpen reports membership', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'));
    expect(s.isOpen('a')).toBe(true);
    expect(s.isOpen('b')).toBe(false);
  });

  it('openOverlay is idempotent', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'));
    s.openOverlay(overlay('a'));
    expect(s.size()).toBe(1);
  });

  it('last-opened-on-top ordering', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'));
    s.openOverlay(overlay('b'));
    s.openOverlay(overlay('c'));
    expect(s.snapshot().map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(s.topmost()?.id).toBe('c');
  });

  it('clear empties the stack', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'));
    s.openOverlay(overlay('b'));
    s.clear();
    expect(s.size()).toBe(0);
  });

  it('snapshot returns a copy, not a reference', () => {
    const s = new OverlayStack();
    s.openOverlay(overlay('a'));
    const snap = s.snapshot();
    s.openOverlay(overlay('b'));
    expect(snap).toHaveLength(1);
    expect(s.snapshot()).toHaveLength(2);
  });

  it('exports OVERLAY_MAX_DEPTH = 5', () => {
    expect(OVERLAY_MAX_DEPTH).toBe(5);
  });
});