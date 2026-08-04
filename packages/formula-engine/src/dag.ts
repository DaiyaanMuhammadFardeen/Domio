/**
 * Formula dependency graph for tracking field dependencies and detecting cycles.
 */

import { parseFormula } from './parser.js';
import type { FormulaAST } from './ast.js';

export interface CycleInfo {
  path: string[];
}

export class FormulaDependencyGraph {
  private dependencies = new Map<string, string[]>();
  private dependents = new Map<string, Set<string>>();

  /**
   * Add a field with its formula expression.
   * Parses the expression and collects referenced field names.
   */
  addField(fieldId: string, expression: string): void {
    const ast = parseFormula(expression);
    const refs = this.extractReferences(ast);
    this.dependencies.set(fieldId, refs);

    // Update reverse mapping
    for (const ref of refs) {
      if (!this.dependents.has(ref)) {
        this.dependents.set(ref, new Set());
      }
      this.dependents.get(ref)!.add(fieldId);
    }
  }

  /**
   * Get the fields that `fieldId` depends on.
   */
  getDependencies(fieldId: string): string[] {
    return this.dependencies.get(fieldId) ?? [];
  }

  /**
   * Get the fields that depend on `fieldId`.
   */
  getDependents(fieldId: string): string[] {
    return Array.from(this.dependents.get(fieldId) ?? []);
  }

  /**
   * Topological order of all fields.
   * Uses Kahn's algorithm.
   */
  topologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    const allFields = new Set<string>();

    // Initialize
    for (const [field, deps] of this.dependencies) {
      allFields.add(field);
      if (!inDegree.has(field)) inDegree.set(field, 0);
      for (const dep of deps) {
        allFields.add(dep);
        inDegree.set(field, (inDegree.get(field) ?? 0) + 1);
      }
    }

    // Queue fields with no dependencies
    const queue: string[] = [];
    for (const field of allFields) {
      if ((inDegree.get(field) ?? 0) === 0) {
        queue.push(field);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const dependent of this.getDependents(current)) {
        const deg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) {
          queue.push(dependent);
        }
      }
    }

    return result;
  }

  /**
   * Detect cycles in the dependency graph.
   * Returns array of cycle paths (e.g., [['a','b','c','a']]).
   */
  detectCycles(): CycleInfo[] {
    const cycles: CycleInfo[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];
    const getDeps = this.getDependencies.bind(this);

    function dfs(field: string): void {
      if (inStack.has(field)) {
        // Found a cycle — extract the cycle path
        const cycleStart = path.indexOf(field);
        if (cycleStart >= 0) {
          cycles.push({
            path: [...path.slice(cycleStart), field],
          });
        }
        return;
      }
      if (visited.has(field)) return;

      visited.add(field);
      inStack.add(field);
      path.push(field);

      for (const dep of getDeps(field)) {
        dfs(dep);
      }

      path.pop();
      inStack.delete(field);
    }

    for (const field of this.dependencies.keys()) {
      dfs(field);
    }

    return cycles;
  }

  /**
   * Check if the graph has any cycles.
   */
  hasCycle(): boolean {
    return this.detectCycles().length > 0;
  }

  /**
   * Extract field references from an AST.
   * References whose names are known fields are extracted.
   * Range nodes are treated as leaf arrays, not field references.
   */
  private extractReferences(ast: FormulaAST): string[] {
    const refs: string[] = [];
    const visited = new Set<FormulaAST>();

    function walk(node: FormulaAST): void {
      if (visited.has(node)) return;
      visited.add(node);

      switch (node.kind) {
        case 'reference': {
          // Only include if it's a known field (not a cell ref like A1)
          refs.push(node.name);
          break;
        }
        case 'range':
          // Ranges are leaf arrays, not field references
          break;
        case 'call':
          for (const arg of node.args) {
            walk(arg);
          }
          break;
        case 'op':
          if (node.left) walk(node.left);
          if (node.right) walk(node.right);
          break;
        case 'literal':
          break;
      }
    }

    walk(ast);
    return refs;
  }
}
