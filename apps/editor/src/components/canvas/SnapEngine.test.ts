import { describe, expect, it } from 'vitest';
import { SnapEngine } from './SnapEngine';

describe('SnapEngine', () => {
  const guides = [
    { id: 'v-100', orientation: 'vertical' as const, position: 100 },
    { id: 'h-50', orientation: 'horizontal' as const, position: 50 },
  ];

  it('snaps to a vertical guide near the left edge', () => {
    const engine = new SnapEngine({ guides, snapToGrid: false });
    const hint = engine.snap({ x: 96, y: 0, w: 200, h: 100 });
    expect(hint.x).toBe(100);
    expect(hint.triggered).toContain('guide-v-100');
  });

  it('snaps to a horizontal guide near the top edge', () => {
    const engine = new SnapEngine({ guides, snapToGrid: false });
    const hint = engine.snap({ x: 0, y: 47, w: 200, h: 100 });
    expect(hint.y).toBe(50);
    expect(hint.triggered).toContain('guide-h-50');
  });

  it('snaps to a grid line when no guide is in range', () => {
    const engine = new SnapEngine({ guides: [], radius: 8 });
    const hint = engine.snap({ x: 13, y: 14, w: 200, h: 100 });
    expect(hint.x).toBe(16);
    expect(hint.y).toBe(16);
  });

  it('does not move the rect when nothing is in range', () => {
    const engine = new SnapEngine({
      guides,
      radius: 1,
      snapToGrid: false,
    });
    const hint = engine.snap({ x: 200, y: 200, w: 50, h: 50 });
    expect(hint.x).toBe(200);
    expect(hint.y).toBe(200);
    expect(hint.triggered).toHaveLength(0);
  });

  it('records both the guide and the grid when both fire', () => {
    const engine = new SnapEngine({ guides });
    const hint = engine.snap({ x: 96, y: 96, w: 0, h: 0 });
    // Guide at x=100 first pulls the candidate to 100; then the
    // 8-px grid snaps it to the next intersection (104).
    expect(hint.x).toBe(104);
    expect(hint.triggered).toContain('guide-v-100');
    expect(hint.triggered).toContain('grid-square');
  });

  it('respects snapToGrid: false', () => {
    const engine = new SnapEngine({
      guides: [],
      snapToGrid: false,
      radius: 8,
    });
    const hint = engine.snap({ x: 13, y: 14, w: 200, h: 100 });
    expect(hint.x).toBe(13);
    expect(hint.y).toBe(14);
  });
});
