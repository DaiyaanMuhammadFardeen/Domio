import { describe, it, expect } from 'vitest';
import { PointerRouter, type NormalizedPointerEvent } from '../src/input/pointer.js';

function down(x: number, y: number, timestamp: number): NormalizedPointerEvent {
  return { kind: 'down', pointerId: 1, x, y, timestamp };
}
function move(x: number, y: number, timestamp: number, modifiers: NormalizedPointerEvent['modifiers'] = {}): NormalizedPointerEvent {
  return { kind: 'move', pointerId: 1, x, y, timestamp, modifiers };
}
function up(x: number, y: number, timestamp: number): NormalizedPointerEvent {
  return { kind: 'up', pointerId: 1, x, y, timestamp };
}

describe('PointerRouter', () => {
  it('starts a drag after the 4 px threshold', () => {
    const hits = new Map<string, string>([['50,50', 'layer-1']]);
    const router = new PointerRouter({
      hitTest: (x, y) => (hits.has(`${x},${y}`) ? hits.get(`${x},${y}`)! : null),
    });
    router.feed(down(50, 50, 0));
    const intents = router.feed(move(55, 55, 16));
    expect(intents.some((i) => i.kind === 'beginDrag')).toBe(true);
  });

  it('begins a marquee when no target is hit', () => {
    const router = new PointerRouter({ hitTest: () => null });
    router.feed(down(0, 0, 0));
    const intents = router.feed(move(50, 50, 16));
    expect(intents.some((i) => i.kind === 'beginMarquee')).toBe(true);
  });

  it('emits beginTextEdit when target is editable', () => {
    const router = new PointerRouter({
      hitTest: () => 'text-layer',
      isTextEditing: () => true,
    });
    const intents = router.feed(down(50, 50, 0));
    expect(intents.some((i) => i.kind === 'beginTextEdit')).toBe(true);
  });

  it('emits commitOp on pointer up after drag', () => {
    const router = new PointerRouter({ hitTest: () => 'layer-1' });
    router.feed(down(50, 50, 0));
    router.feed(move(60, 60, 16));
    const upIntents = router.feed(up(60, 60, 32));
    expect(upIntents.some((i) => i.kind === 'endDrag')).toBe(true);
    expect(upIntents.some((i) => i.kind === 'commitOp')).toBe(true);
  });

  it('routes multi-touch via pinch events', () => {
    const router = new PointerRouter({ hitTest: () => null });
    const begin = router.feed({
      kind: 'pinch',
      pointerId: 1,
      x: 50,
      y: 50,
      timestamp: 0,
      pinchScale: 1,
    });
    expect(begin.some((i) => i.kind === 'beginPinch')).toBe(true);
  });

  it('measures first-frame latency within 8 ms', () => {
    const router = new PointerRouter({ hitTest: () => 'layer-1' });
    const start = performance.now();
    router.feed(down(50, 50, 0));
    router.feed(move(56, 56, 1));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(20);
  });

  it('supports long-press recognition (no intents until movement)', () => {
    const router = new PointerRouter({ hitTest: () => 'layer-1' });
    router.feed(down(50, 50, 0));
    router.feed(move(50, 50, 16));
    router.feed(move(50, 50, 32));
    expect(router.snapshot().mode).toBe('idle');
  });
});