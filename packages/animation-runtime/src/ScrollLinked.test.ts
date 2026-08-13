/**
 * @domio/animation-runtime — ScrollLinked tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScrollLinked } from './ScrollLinked.js';
import type { ScrollLinkedBinding } from './ScrollLinked.js';

describe('ScrollLinked', () => {
  let sl: ScrollLinked;

  beforeEach(() => {
    sl = new ScrollLinked();
  });

  function makeBinding(overrides?: Partial<ScrollLinkedBinding>): ScrollLinkedBinding {
    return {
      id: 'binding-1',
      elementId: 'el-1',
      property: 'transform',
      progressRange: [0, 1],
      valueRange: [0, 100],
      ...overrides,
    };
  }

  describe('add', () => {
    it('adds a binding', () => {
      expect(sl.add(makeBinding())).toBe(true);
      expect(sl.count).toBe(1);
    });

    it('rejects when cap (32) is exceeded', () => {
      for (let i = 0; i < 32; i++) {
        sl.add(makeBinding({ id: `b-${i}`, elementId: `el-${i}` }));
      }
      expect(sl.count).toBe(32);

      const overflow = sl.add(makeBinding({ id: 'b-overflow', elementId: 'el-overflow' }));
      expect(overflow).toBe(false);
    });
  });

  describe('overflow warning', () => {
    it('emits overflow warning when cap exceeded', () => {
      for (let i = 0; i < 32; i++) {
        sl.add(makeBinding({ id: `b-${i}`, elementId: `el-${i}` }));
      }

      const warnings: Array<{ type: string; count: number; cap: number }> = [];
      sl.subscribe((w) => {
        if (w.type === 'overflow') {
          warnings.push(w);
        }
      });

      sl.add(makeBinding({ id: 'b-overflow', elementId: 'el-overflow' }));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.count).toBe(32);
      expect(warnings[0]?.cap).toBe(32);
    });
  });

  describe('scroll-linked-depends-on-scroll-linked', () => {
    it('rejects a scroll-linked animation that depends on another scroll-linked', () => {
      sl.add(makeBinding({ id: 'b-1', elementId: 'el-1', property: 'transform' }));

      const warnings: Array<{ type: string; bindingId: string; dependsOn: string }> = [];
      sl.subscribe((w) => {
        if (w.type === 'dependency_cycle') {
          warnings.push(w);
        }
      });

      // Same elementId, different property — rejected
      const result = sl.add(makeBinding({ id: 'b-2', elementId: 'el-1', property: 'opacity' }));
      expect(result).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.bindingId).toBe('b-2');
      expect(warnings[0]?.dependsOn).toBe('b-1');
    });

    it('allows different elements', () => {
      sl.add(makeBinding({ id: 'b-1', elementId: 'el-1' }));
      const result = sl.add(makeBinding({ id: 'b-2', elementId: 'el-2' }));
      expect(result).toBe(true);
    });
  });

  describe('setProgress', () => {
    it('interpolates values based on scroll progress', () => {
      sl.add(
        makeBinding({
          progressRange: [0, 1],
          valueRange: [0, 100],
        }),
      );

      const results = sl.setProgress(0.5);
      expect(results.get('el-1:transform')).toBe(50);
    });

    it('maps partial progress range', () => {
      sl.add(
        makeBinding({
          progressRange: [0.2, 0.8],
          valueRange: [0, 200],
        }),
      );

      // p=0.5 → normalized = (0.5 - 0.2) / (0.8 - 0.2) = 0.5
      const results = sl.setProgress(0.5);
      expect(results.get('el-1:transform')).toBeCloseTo(100, 5);
    });

    it('clamps progress to [0, 1]', () => {
      sl.add(
        makeBinding({
          progressRange: [0, 1],
          valueRange: [0, 100],
        }),
      );

      const results1 = sl.setProgress(-0.5);
      expect(results1.get('el-1:transform')).toBe(0);

      const results2 = sl.setProgress(1.5);
      expect(results2.get('el-1:transform')).toBe(100);
    });

    it('interpolates string values', () => {
      sl.add(
        makeBinding({
          elementId: 'el-1',
          property: 'translateX',
          progressRange: [0, 1],
          valueRange: ['translate(0px, 0px)', 'translate(100px, 0px)'],
        }),
      );

      const results = sl.setProgress(0.5);
      expect(results.get('el-1:translateX')).toBe('translate(50px, 0px)');
    });
  });

  describe('remove', () => {
    it('removes a binding', () => {
      sl.add(makeBinding({ id: 'b-1', elementId: 'el-1' }));
      sl.add(makeBinding({ id: 'b-2', elementId: 'el-2' }));
      expect(sl.count).toBe(2);

      sl.remove('b-1');
      expect(sl.count).toBe(1);
    });
  });

  describe('multiple bindings', () => {
    it('interpolates all bindings at once', () => {
      sl.add(
        makeBinding({ id: 'b-1', elementId: 'el-1', property: 'opacity', valueRange: [0, 1] }),
      );
      sl.add(
        makeBinding({ id: 'b-2', elementId: 'el-2', property: 'opacity', valueRange: [0, 1] }),
      );

      const results = sl.setProgress(0.75);
      expect(results.get('el-1:opacity')).toBe(0.75);
      expect(results.get('el-2:opacity')).toBe(0.75);
    });
  });
});
