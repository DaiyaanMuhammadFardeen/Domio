/**
 * BranchingGraph tests — SCC, traversal, cycle detection, validation.
 */

import { describe, expect, it } from 'vitest';
import { BranchingGraph, DEFAULT_MAX_HOPS } from './graph.js';

function edge(from: string, to: string, id = `${from}->${to}`) {
  return {
    id,
    tenantId: 't1',
    deckId: 'd1',
    fromSlideId: from,
    toSlideId: to,
    name: id,
    ruleId: null,
    priority: 0,
    createdAt: 0,
  };
}

function node(id: string, isStart = false, defaultStart = false) {
  return { id, isStart, defaultStart };
}

describe('BranchingGraph', () => {
  it('default maxHops is 100', () => {
    expect(DEFAULT_MAX_HOPS).toBe(100);
    expect(new BranchingGraph().getMaxHops()).toBe(100);
  });

  it('setMaxHops rejects <1', () => {
    const g = new BranchingGraph();
    expect(() => g.setMaxHops(0)).toThrow();
  });

  it('rejects self-loops on addEdge', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1'));
    expect(() => g.addEdge(edge('s1', 's1'))).toThrow();
  });

  it('rejects edges referencing unknown nodes', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1'));
    expect(() => g.addEdge(edge('s1', 's2'))).toThrow(/Unknown target/);
  });

  it('validates a small acyclic graph with no errors', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1', true, true));
    g.addNode(node('s2'));
    g.addNode(node('s3'));
    g.addEdge(edge('s1', 's2'));
    g.addEdge(edge('s2', 's3'));
    const v = g.validate();
    expect(v.hasCycle).toBe(false);
    expect(v.unreachable).toEqual([]);
    expect(v.islands).toEqual([]);
    expect(v.multiStart).toEqual([]);
  });

  it('detects a 3-cycle A → B → C → A', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addNode(node('C'));
    g.addEdge(edge('A', 'B'));
    g.addEdge(edge('B', 'C'));
    g.addEdge(edge('C', 'A'));
    const v = g.validate();
    expect(v.hasCycle).toBe(true);
    expect(v.cycles.length).toBeGreaterThan(0);
    expect([...v.cycles[0]!].sort()).toEqual(['A', 'B', 'C']);
  });

  it('finds a sample cycle path', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addNode(node('C'));
    g.addEdge(edge('A', 'B'));
    g.addEdge(edge('B', 'C'));
    g.addEdge(edge('C', 'A'));
    const path = g.findCyclePath();
    expect(path).not.toBe(null);
    expect(path!.length).toBeGreaterThanOrEqual(2);
    expect(path![0]).toBe(path![path!.length - 1]); // closes
  });

  it('findCyclePath returns null for an acyclic graph', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addEdge(edge('A', 'B'));
    expect(g.findCyclePath()).toBe(null);
  });

  it('flags unreachable nodes', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1', true, true));
    g.addNode(node('s2'));
    g.addNode(node('orphan'));
    g.addEdge(edge('s1', 's2'));
    const v = g.validate();
    expect(v.unreachable).toContain('orphan');
  });

  it('flags islands (connected components without a start)', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1', true, true));
    g.addNode(node('s2'));
    g.addNode(node('i1'));
    g.addNode(node('i2'));
    g.addEdge(edge('s1', 's2'));
    g.addEdge(edge('i1', 'i2'));
    const v = g.validate();
    expect(v.islands.length).toBe(1);
    expect([...v.islands[0]!].sort()).toEqual(['i1', 'i2']);
  });

  it('flags multi-start when no default_start is set', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1', true, false));
    g.addNode(node('s2', true, false));
    const v = g.validate();
    expect(v.multiStart).toContain('s2');
  });

  it('does NOT flag multi-start when exactly one default_start is set', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1', true, true));
    g.addNode(node('s2', true, false));
    const v = g.validate();
    expect(v.multiStart).toEqual([]);
  });

  it('removeEdge breaks a cycle', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addEdge(edge('A', 'B'));
    g.addEdge(edge('B', 'A'));
    expect(g.validate().hasCycle).toBe(true);
    g.removeEdge('A', 'B');
    expect(g.validate().hasCycle).toBe(false);
  });

  it('traverse visits up to maxHops', () => {
    const g = new BranchingGraph();
    g.addNode(node('s1'));
    g.addNode(node('s2'));
    g.addNode(node('s3'));
    g.addEdge(edge('s1', 's2'));
    g.addEdge(edge('s2', 's3'));
    g.addEdge(edge('s3', 's1')); // cycle
    g.setMaxHops(3);
    const r = g.traverse('s1');
    expect(r.path).toEqual(['s1', 's2', 's3', 's1']);
    expect(r.cappedAt).toBe(3); // cycle would continue forever; cap terminates
  });

  it('traverse caps at maxHops when no termination', () => {
    const g = new BranchingGraph({ maxHops: 3 });
    g.addNode(node('s1'));
    g.addNode(node('s2'));
    g.addNode(node('s3'));
    g.addEdge(edge('s1', 's2'));
    g.addEdge(edge('s2', 's3'));
    g.addEdge(edge('s3', 's2')); // cycle back so traverse doesn't terminate
    const r = g.traverse('s1', { maxHops: 3 });
    expect(r.cappedAt).toBe(3);
  });

  it('neighbors and predecessors report correctly', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addNode(node('C'));
    g.addEdge(edge('A', 'B'));
    g.addEdge(edge('A', 'C'));
    expect([...g.neighbors('A')].sort()).toEqual(['B', 'C']);
    expect(g.predecessors('B')).toEqual(['A']);
  });

  it('removeNode drops incoming and outgoing edges', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addEdge(edge('A', 'B'));
    g.removeNode('B');
    expect(g.neighbors('A')).toEqual([]);
  });

  it('stronglyConnectedComponents on a DAG returns 1-vertex SCCs', () => {
    const g = new BranchingGraph();
    g.addNode(node('A'));
    g.addNode(node('B'));
    g.addNode(node('C'));
    g.addEdge(edge('A', 'B'));
    g.addEdge(edge('B', 'C'));
    const sccs = g.stronglyConnectedComponents();
    expect(sccs.length).toBe(3);
    for (const scc of sccs) expect(scc.length).toBe(1);
  });
});
