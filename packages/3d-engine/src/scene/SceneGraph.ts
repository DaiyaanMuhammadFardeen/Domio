/**
 * Scene graph — mirrors a GLTF node hierarchy.
 *
 * Nodes form a parent/child tree with local-space transforms.  The graph
 * validates that every non-root node references an existing parent.
 */

import type { Mat4, ModelNode } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

export interface SceneTreeNode {
  node: ModelNode;
  children: SceneTreeNode[];
}

// ---------------------------------------------------------------------------
// SceneGraph
// ---------------------------------------------------------------------------

export class SceneGraph {
  private nodes = new Map<string, ModelNode>();
  private roots: string[] = [];

  /**
   * Build the graph from a flat array of `ModelNode` entries.
   * Throws if a node references a non-existent parent.
   */
  build(nodeList: ModelNode[]): void {
    this.nodes.clear();
    this.roots = [];

    // Index all nodes
    for (const n of nodeList) {
      this.nodes.set(n.id, n);
    }

    // Validate parent references
    for (const n of nodeList) {
      if (n.parentId !== null && !this.nodes.has(n.parentId)) {
        throw new Error(
          `Node "${n.id}" references non-existent parent "${n.parentId}"`,
        );
      }
    }

    // Identify roots (parentId === null)
    for (const n of nodeList) {
      if (n.parentId === null) {
        this.roots.push(n.id);
      }
    }
  }

  /** Get a node by id. */
  getNode(id: string): ModelNode | undefined {
    return this.nodes.get(id);
  }

  /** Get all children of a node (direct descendants). */
  getChildren(parentId: string): ModelNode[] {
    const children: ModelNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.parentId === parentId) {
        children.push(n);
      }
    }
    return children;
  }

  /** Get root nodes. */
  getRoots(): ModelNode[] {
    return this.roots
      .map((id) => this.nodes.get(id))
      .filter((n): n is ModelNode => n !== undefined);
  }

  /**
   * Walk the tree depth-first, calling `visitor` for each node.
   * The visitor receives the node, its depth, and its parent id.
   */
  walk(
    visitor: (node: ModelNode, depth: number, parentId: string | null) => void,
  ): void {
    for (const rootId of this.roots) {
      const node = this.nodes.get(rootId);
      if (node !== undefined) {
        this.walkNode(node, 0, visitor);
      }
    }
  }

  private walkNode(
    node: ModelNode,
    depth: number,
    visitor: (node: ModelNode, depth: number, parentId: string | null) => void,
  ): void {
    visitor(node, depth, node.parentId);
    for (const child of this.getChildren(node.id)) {
      this.walkNode(child, depth + 1, visitor);
    }
  }

  /** Get the full ancestry chain (bottom-up) for a node. */
  getAncestry(nodeId: string): ModelNode[] {
    const chain: ModelNode[] = [];
    let current = this.nodes.get(nodeId);
    while (current !== undefined) {
      chain.push(current);
      current =
        current.parentId !== null
          ? this.nodes.get(current.parentId)
          : undefined;
    }
    return chain;
  }

  /**
   * Validate that every non-root node has a valid parent chain to a root.
   * Returns an array of error messages (empty = valid).
   */
  validate(): string[] {
    const errors: string[] = [];
    for (const n of this.nodes.values()) {
      if (n.parentId === null) continue;
      const ancestry = this.getAncestry(n.id);
      // ancestry[0] is the node itself, ancestry[last] should have parentId === null
      const last = ancestry[ancestry.length - 1];
      if (last === undefined || last.parentId !== null) {
        errors.push(`Node "${n.id}" has no root ancestor`);
      }
    }
    return errors;
  }

  /** Total node count. */
  get size(): number {
    return this.nodes.size;
  }
}

// ---------------------------------------------------------------------------
// Utility: identity matrix
// ---------------------------------------------------------------------------

export function identityMat4(): Mat4 {
  return {
    elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  };
}
