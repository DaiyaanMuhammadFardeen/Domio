import { describe, it, expect } from 'vitest';
import { SceneGraph, identityMat4 } from './SceneGraph.js';
import type { ModelNode } from '../contracts/renderer.v1.js';

function node(
  id: string,
  parentId: string | null = null,
  name = id,
): ModelNode {
  return {
    id,
    name,
    parentId,
    transform: identityMat4(),
  };
}

describe('SceneGraph', () => {
  it('builds from a flat node list', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('child', 'root'), node('grandchild', 'child')]);
    expect(g.size).toBe(3);
  });

  it('identifies root nodes', () => {
    const g = new SceneGraph();
    g.build([
      node('root-a'),
      node('root-b'),
      node('child', 'root-a'),
    ]);
    const roots = g.getRoots();
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => r.id).sort()).toEqual(['root-a', 'root-b']);
  });

  it('returns children of a node', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('a', 'root'), node('b', 'root'), node('c', 'a')]);
    const children = g.getChildren('root');
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty children for a leaf', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('leaf', 'root')]);
    expect(g.getChildren('leaf')).toHaveLength(0);
  });

  it('throws on non-existent parent', () => {
    const g = new SceneGraph();
    expect(() => g.build([node('orphan', 'ghost')])).toThrow(
      'references non-existent parent "ghost"',
    );
  });

  it('walks depth-first', () => {
    const g = new SceneGraph();
    g.build([
      node('root'),
      node('a', 'root'),
      node('b', 'root'),
      node('c', 'a'),
    ]);
    const visited: string[] = [];
    g.walk((n) => visited.push(n.id));
    expect(visited).toEqual(['root', 'a', 'c', 'b']);
  });

  it('walk reports correct depth', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('child', 'root'), node('gc', 'child')]);
    const depths: number[] = [];
    g.walk((_n, depth) => depths.push(depth));
    expect(depths).toEqual([0, 1, 2]);
  });

  it('walk reports parent ids', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('child', 'root')]);
    const parentIds: (string | null)[] = [];
    g.walk((_n, _d, pid) => parentIds.push(pid));
    expect(parentIds).toEqual([null, 'root']);
  });

  it('getAncestry returns bottom-up chain', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('child', 'root'), node('gc', 'child')]);
    const chain = g.getAncestry('gc');
    expect(chain.map((n) => n.id)).toEqual(['gc', 'child', 'root']);
  });

  it('validate returns empty for a valid tree', () => {
    const g = new SceneGraph();
    g.build([node('root'), node('child', 'root')]);
    expect(g.validate()).toHaveLength(0);
  });

  it('getNode returns undefined for unknown id', () => {
    const g = new SceneGraph();
    g.build([node('root')]);
    expect(g.getNode('unknown')).toBeUndefined();
  });
});
