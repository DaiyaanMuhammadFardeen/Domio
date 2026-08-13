import { describe, it, expect } from 'vitest';
import { selectRenderer, renderWithEscalation } from './select-renderer.js';

describe('selectRenderer', () => {
  it('returns svg for < 1000 points', () => {
    expect(selectRenderer(0)).toBe('svg');
    expect(selectRenderer(500)).toBe('svg');
    expect(selectRenderer(999)).toBe('svg');
  });

  it('returns svg at 1000–10000', () => {
    expect(selectRenderer(1000)).toBe('svg');
    expect(selectRenderer(5000)).toBe('svg');
    expect(selectRenderer(10000)).toBe('svg');
  });

  it('returns canvas2d for > 10000', () => {
    expect(selectRenderer(10001)).toBe('canvas2d');
    expect(selectRenderer(50000)).toBe('canvas2d');
  });
});

describe('renderWithEscalation', () => {
  it('returns svg for small data', () => {
    const backends: string[] = [];
    const backend = renderWithEscalation(500, (b) => {
      backends.push(b);
    });
    expect(backend).toBe('svg');
    expect(backends).toEqual(['svg']);
  });

  it('returns canvas2d for large data', () => {
    const backends: string[] = [];
    const backend = renderWithEscalation(20000, (b) => {
      backends.push(b);
    });
    expect(backend).toBe('canvas2d');
    expect(backends).toEqual(['canvas2d']);
  });

  it('snapshot of dispatched backends at thresholds', () => {
    const results = [100, 999, 1000, 5000, 10000, 10001, 50000].map((n) => {
      let dispatched = '';
      renderWithEscalation(n, (b) => {
        dispatched = b;
      });
      return dispatched;
    });
    expect(results).toEqual(['svg', 'svg', 'svg', 'svg', 'svg', 'canvas2d', 'canvas2d']);
  });
});
