/**
 * Tests for formula dependency graph.
 */

import { describe, it, expect } from 'vitest';
import { FormulaDependencyGraph } from './dag.js';

describe('FormulaDependencyGraph', () => {
  describe('addField and getDependencies', () => {
    it('tracks simple dependency', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      expect(g.getDependencies('A')).toEqual(['B']);
    });

    it('tracks multiple dependencies', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + C');
      expect(g.getDependencies('A')).toEqual(['B', 'C']);
    });

    it('returns empty for field with no deps', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', '42');
      expect(g.getDependencies('A')).toEqual([]);
    });

    it('returns empty for unknown field', () => {
      const g = new FormulaDependencyGraph();
      expect(g.getDependencies('unknown')).toEqual([]);
    });
  });

  describe('getDependents', () => {
    it('tracks reverse dependency', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      expect(g.getDependents('B')).toEqual(['A']);
    });

    it('tracks multiple dependents', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('C', 'B * 2');
      const dependents = g.getDependents('B');
      expect(dependents).toContain('A');
      expect(dependents).toContain('C');
    });

    it('returns empty for field with no dependents', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', '42');
      expect(g.getDependents('A')).toEqual([]);
    });
  });

  describe('topologicalOrder', () => {
    it('returns a valid topological order', () => {
      const g = new FormulaDependencyGraph();
      // D depends on A, A depends on B and C
      g.addField('D', 'A + 1');
      g.addField('A', 'B + C');
      g.addField('B', '10');
      g.addField('C', '20');

      const order = g.topologicalOrder();

      // B and C must come before A
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'));
      // A must come before D
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('D'));
    });

    it('handles independent fields', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', '1');
      g.addField('B', '2');
      g.addField('C', '3');

      const order = g.topologicalOrder();
      expect(order).toHaveLength(3);
      expect(order).toContain('A');
      expect(order).toContain('B');
      expect(order).toContain('C');
    });

    it('handles chain A -> B -> C', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('B', 'C + 1');
      g.addField('C', '1');

      const order = g.topologicalOrder();
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
    });
  });

  describe('detectCycles', () => {
    it('detects a self-cycle', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'A + 1');

      const cycles = g.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]!.path).toContain('A');
    });

    it('detects a two-node cycle', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('B', 'A + 1');

      const cycles = g.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      // Cycle path should contain both A and B
      const path = cycles[0]!.path;
      expect(path).toContain('A');
      expect(path).toContain('B');
    });

    it('detects a three-node cycle', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('B', 'C + 1');
      g.addField('C', 'A + 1');

      const cycles = g.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      const path = cycles[0]!.path;
      expect(path).toContain('A');
      expect(path).toContain('B');
      expect(path).toContain('C');
    });

    it('reports reachable path in cycle', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B');
      g.addField('B', 'A');

      const cycles = g.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      const path = cycles[0]!.path;
      // Path should start and end with the same field
      expect(path[0]).toBe(path[path.length - 1]);
    });

    it('returns no cycles for acyclic graph', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('B', 'C + 1');
      g.addField('C', '1');

      const cycles = g.detectCycles();
      expect(cycles).toHaveLength(0);
    });

    it('hasCycle returns true for cyclic graph', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B');
      g.addField('B', 'A');
      expect(g.hasCycle()).toBe(true);
    });

    it('hasCycle returns false for acyclic graph', () => {
      const g = new FormulaDependencyGraph();
      g.addField('A', 'B + 1');
      g.addField('B', '1');
      expect(g.hasCycle()).toBe(false);
    });
  });

  describe('complex dependency graph', () => {
    it('handles A -> B, A -> C, D -> A', () => {
      const g = new FormulaDependencyGraph();
      g.addField('D', 'A + 1');
      g.addField('A', 'B + C');
      g.addField('B', '10');
      g.addField('C', '20');

      expect(g.getDependencies('D')).toEqual(['A']);
      expect(g.getDependencies('A')).toEqual(['B', 'C']);
      expect(g.getDependents('A')).toEqual(['D']);
      expect(g.getDependents('B')).toEqual(['A']);
      expect(g.getDependents('C')).toEqual(['A']);

      const order = g.topologicalOrder();
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'));
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('D'));
    });
  });
});
