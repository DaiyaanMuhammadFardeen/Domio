/**
 * BranchingGraph — adjacency-list graph of slide IDs connected by
 * branching edges. Provides Tarjan-style SCC detection (cycles),
 * reachability, and traversal with a hops-per-session cap.
 *
 * Spec §M1.3 / §M2.1 acceptance:
 *   - Cycle detection reports the reachable path.
 *   - `max_hops_per_session = 100` default cap; escape-room override up to 10000.
 *   - Multi-start / multi-end validated; exactly one is `default_start`.
 */

import type { BranchingEdge } from '../types.js';

export const DEFAULT_MAX_HOPS = 100;
export const ESCAPE_ROOM_MAX_HOPS = 10_000;

export interface GraphNode {
  readonly id: string;
  readonly isStart: boolean;
  readonly defaultStart: boolean;
}

export interface GraphValidation {
  readonly hasCycle: boolean;
  readonly cycles: readonly (readonly string[])[];
  readonly unreachable: readonly string[];
  readonly islands: readonly (readonly string[])[];
  readonly multiStart: readonly string[];
}

export class BranchingGraph {
  /** nodes by id */
  private readonly nodes = new Map<string, GraphNode>();
  /** outgoing edges by source slide */
  private readonly outgoing = new Map<string, Set<string>>();
  /** reverse map for reporting reachable paths */
  private readonly incoming = new Map<string, Set<string>>();
  private maxHops = DEFAULT_MAX_HOPS;

  constructor(opts: { maxHops?: number } = {}) {
    if (opts.maxHops !== undefined) this.maxHops = opts.maxHops;
  }

  setMaxHops(n: number): void {
    if (n < 1) throw new Error('maxHops must be ≥ 1');
    this.maxHops = n;
  }

  getMaxHops(): number {
    return this.maxHops;
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, new Set());
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, new Set());
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    // Drop this id from every other node's outgoing and incoming sets so
    // dangling edge references don't survive a node removal.
    for (const set of this.outgoing.values()) set.delete(id);
    for (const set of this.incoming.values()) set.delete(id);
  }

  addEdge(edge: BranchingEdge): void {
    if (edge.fromSlideId === edge.toSlideId) {
      throw new Error(`Self-loop not allowed: ${edge.fromSlideId}`);
    }
    if (!this.nodes.has(edge.fromSlideId)) {
      throw new Error(`Unknown source slide '${edge.fromSlideId}'`);
    }
    if (!this.nodes.has(edge.toSlideId)) {
      throw new Error(`Unknown target slide '${edge.toSlideId}'`);
    }
    const set = this.outgoing.get(edge.fromSlideId) ?? new Set();
    set.add(edge.toSlideId);
    this.outgoing.set(edge.fromSlideId, set);
    const back = this.incoming.get(edge.toSlideId) ?? new Set();
    back.add(edge.fromSlideId);
    this.incoming.set(edge.toSlideId, back);
  }

  removeEdge(from: string, to: string): void {
    this.outgoing.get(from)?.delete(to);
    this.incoming.get(to)?.delete(from);
  }

  /** Outgoing neighbors for a slide. */
  neighbors(id: string): readonly string[] {
    return Array.from(this.outgoing.get(id) ?? []);
  }

  /** Incoming neighbors for a slide. */
  predecessors(id: string): readonly string[] {
    return Array.from(this.incoming.get(id) ?? []);
  }

  /** Tarjan-style SCC — returns the strongly-connected components. */
  stronglyConnectedComponents(): readonly (readonly string[])[] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const result: string[][] = [];

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowlinks.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);
      const outs = this.outgoing.get(v);
      if (outs) {
        for (const w of outs) {
          if (!indices.has(w)) {
            strongConnect(w);
            lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
          } else if (onStack.has(w)) {
            lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
          }
        }
      }
      if (lowlinks.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        result.push(scc);
      }
    };

    for (const id of this.nodes.keys()) {
      if (!indices.has(id)) strongConnect(id);
    }
    return result;
  }

  /** Run a full validation. */
  validate(): GraphValidation {
    const sccs = this.stronglyConnectedComponents();
    const cycles = sccs.filter((c) => c.length > 1 || this.hasSelfLoop(c[0]!));
    const sccMembers = new Set<string>();
    for (const c of cycles) for (const id of c) sccMembers.add(id);

    // Reachability from any start node.
    const starts = Array.from(this.nodes.values())
      .filter((n) => n.isStart)
      .map((n) => n.id);
    const reachable = new Set<string>();
    for (const s of starts) {
      const queue: string[] = [s];
      while (queue.length > 0) {
        const v = queue.shift()!;
        if (reachable.has(v)) continue;
        reachable.add(v);
        const outs = this.outgoing.get(v);
        if (outs) for (const w of outs) queue.push(w);
      }
    }

    const unreachable = Array.from(this.nodes.keys()).filter((id) => !reachable.has(id));

    // Islands — connected components that contain no start node.
    const visited = new Set<string>();
    const islands: string[][] = [];
    for (const id of this.nodes.keys()) {
      if (visited.has(id)) continue;
      const component: string[] = [];
      const queue: string[] = [id];
      while (queue.length > 0) {
        const v = queue.shift()!;
        if (visited.has(v)) continue;
        visited.add(v);
        component.push(v);
        const outs = this.outgoing.get(v);
        if (outs) for (const w of outs) queue.push(w);
        const ins = this.incoming.get(v);
        if (ins) for (const u of ins) queue.push(u);
      }
      const hasStart = component.some((id) => this.nodes.get(id)?.isStart);
      if (!hasStart && component.length > 0) islands.push(component);
    }

    // Multi-start detection.
    const multiStart: string[] = [];
    if (starts.length > 1) {
      const defaults = starts.filter((id) => this.nodes.get(id)?.defaultStart);
      if (defaults.length !== 1) {
        for (const id of starts) multiStart.push(id);
      }
    }

    return {
      hasCycle: cycles.length > 0,
      cycles,
      unreachable,
      islands,
      multiStart,
    };
  }

  /** DFS-style traversal from `start` with `maxHops` cap. */
  traverse(
    start: string,
    opts: { maxHops?: number; visit?: (id: string, depth: number) => void } = {},
  ): {
    path: string[];
    cappedAt: number | null;
  } {
    const cap = opts.maxHops ?? this.maxHops;
    const path: string[] = [start];
    let depth = 0;
    let current = start;
    while (depth < cap) {
      const outs = this.outgoing.get(current);
      if (!outs || outs.size === 0) break;
      // Pick the next slide by insertion order (deterministic for the
      // common case of single-edge out-degrees; for multi-out, hosts can
      // pass `opts.visit` to record the path and resolve ties externally).
      const next = outs.values().next().value as string;
      path.push(next);
      opts.visit?.(next, depth + 1);
      current = next;
      depth++;
      if (depth >= cap) {
        return { path, cappedAt: depth };
      }
    }
    return { path, cappedAt: null };
  }

  /** Find a path through any cycle (returns one sample cycle as a path). */
  findCyclePath(): string[] | null {
    const sccs = this.stronglyConnectedComponents();
    for (const scc of sccs) {
      if (scc.length > 1) {
        const start = scc[0]!;
        const path = [start];
        let cur = start;
        while (true) {
          const outs = Array.from(this.outgoing.get(cur) ?? []).filter((o) => scc.includes(o));
          if (outs.length === 0) break;
          const next = outs[0]!;
          if (next === start) {
            path.push(next);
            return path;
          }
          path.push(next);
          cur = next;
        }
        return path;
      }
      if (scc.length === 1 && this.hasSelfLoop(scc[0]!)) {
        return [scc[0]!, scc[0]!];
      }
    }
    return null;
  }

  private hasSelfLoop(id: string): boolean {
    return (this.outgoing.get(id) ?? new Set()).has(id);
  }
}
