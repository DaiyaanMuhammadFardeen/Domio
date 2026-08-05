import { describe, it, expect } from 'vitest';
import { generateNetwork, forceLayout } from './NetworkGraph.js';

function makeLod(level: 0 | 1 | 2 | 3) {
  return { level, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
}

describe('forceLayout', () => {
  it('returns empty array for empty nodes', () => {
    expect(forceLayout([], [], 42)).toHaveLength(0);
  });

  it('produces deterministic output for the same seed', () => {
    const nodes = [
      { id: 'a', category: 'x' },
      { id: 'b', category: 'y' },
      { id: 'c', category: 'x' },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const r1 = forceLayout(nodes, edges, 42);
    const r2 = forceLayout(nodes, edges, 42);
    expect(r1).toEqual(r2);
  });

  it('produces different output for different seeds', () => {
    const nodes = [
      { id: 'a', category: 'x' },
      { id: 'b', category: 'y' },
      { id: 'c', category: 'x' },
    ];
    const r1 = forceLayout(nodes, [], 42);
    const r2 = forceLayout(nodes, [], 123);
    expect(r1).not.toEqual(r2);
  });

  it('positions are Vec3', () => {
    const nodes = [{ id: 'a', category: 'x' }];
    const positions = forceLayout(nodes, [], 42);
    expect(positions).toHaveLength(1);
    const p = positions[0]!;
    expect(typeof p.x).toBe('number');
    expect(typeof p.y).toBe('number');
    expect(typeof p.z).toBe('number');
  });
});

describe('generateNetwork', () => {
  it('generates nodes and edges', () => {
    const nodes = [
      { id: 'a', category: 'cat1' },
      { id: 'b', category: 'cat2' },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const result = generateNetwork(nodes, edges, makeLod(0), 42);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.aggregated).toBe(false);
  });

  it('is deterministic — same input produces same output', () => {
    const nodes = [
      { id: 'a', category: 'x' },
      { id: 'b', category: 'y' },
    ];
    const edges = [{ source: 'a', target: 'b' }];
    const r1 = generateNetwork(nodes, edges, makeLod(0), 42);
    const r2 = generateNetwork(nodes, edges, makeLod(0), 42);
    expect(r1).toEqual(r2);
  });

  it('aggregates >50 unique categories to top 50 + other', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({
      id: `n${i}`,
      category: `cat${i}`,
    }));
    const result = generateNetwork(nodes, [], makeLod(0));
    expect(result.aggregated).toBe(true);
    // All nodes should be present
    expect(result.nodes).toHaveLength(60);
    // Check that some categories were renamed to "other"
    const categories = new Set(result.nodes.map((n) => n.category));
    expect(categories.has('other')).toBe(true);
  });

  it('scales instances by LOD', () => {
    const nodes = [
      { id: 'a', category: 'x' },
      { id: 'b', category: 'y' },
    ];
    const r0 = generateNetwork(nodes, [], makeLod(0));
    const r1 = generateNetwork(nodes, [], makeLod(1));
    expect(r0.instanceCount).toBe(2);
    expect(r1.instanceCount).toBe(1);
  });

  it('each node has a position', () => {
    const nodes = [
      { id: 'a', category: 'x', weight: 2 },
      { id: 'b', category: 'y' },
    ];
    const result = generateNetwork(nodes, [], makeLod(0));
    for (const node of result.nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(typeof node.position.z).toBe('number');
    }
    expect(result.nodes[0]!.weight).toBe(2);
    expect(result.nodes[1]!.weight).toBe(1);
  });
});
