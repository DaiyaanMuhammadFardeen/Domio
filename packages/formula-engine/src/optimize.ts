/**
 * Formula AST optimization passes.
 */

import type { FormulaAST, Literal, Op } from './ast.js';
import { FUNCTIONS, type EvalContext, type Value } from './functions.js';

/**
 * Constant fold: fold sub-expressions of literals and pure functions
 * with all-literal args at parse time.
 */
export function constantFold(ast: FormulaAST): FormulaAST {
  const visited = new Map<FormulaAST, FormulaAST>();

  function fold(node: FormulaAST): FormulaAST {
    if (visited.has(node)) return visited.get(node)!;

    let result: FormulaAST;

    switch (node.kind) {
      case 'literal':
      case 'reference':
      case 'range':
        result = node;
        break;

      case 'op': {
        const foldedLeft = node.left ? fold(node.left) : undefined;
        const foldedRight = node.right ? fold(node.right) : undefined;

        // If both children are literals, try to fold
        if (foldedLeft?.kind === 'literal' && foldedRight?.kind === 'literal') {
          const folded = tryFoldOp(node.operator, foldedLeft, foldedRight);
          if (folded !== null) {
            result = folded;
            break;
          }
        }

        // Unary: if operand is literal, try to fold
        if (node.operator === '-' && foldedLeft?.kind === 'literal' && typeof foldedLeft.value === 'number') {
          result = { kind: 'literal', value: -foldedLeft.value };
          break;
        }
        if (node.operator === '+' && foldedLeft?.kind === 'literal') {
          result = foldedLeft;
          break;
        }

        const opNode: Op = { kind: 'op', operator: node.operator };
        if (foldedLeft !== undefined) opNode.left = foldedLeft;
        if (foldedRight !== undefined) opNode.right = foldedRight;
        result = opNode;
        break;
      }

      case 'call': {
        const args = node.args.map(fold);

        // If all args are literals, try to evaluate the function
        if (args.every((a) => a.kind === 'literal')) {
          const folded = tryFoldCall(node.name, args as Literal[]);
          if (folded !== null) {
            result = folded;
            break;
          }
        }

        result = { kind: 'call', name: node.name, args };
        break;
      }
    }

    visited.set(node, result!);
    return result!;
  }

  return fold(ast);
}

/**
 * Common subexpression elimination: dedupe identical pure subtrees.
 * Returns the optimized AST and a count of saved evaluations.
 */
export function commonSubexpressionElimination(ast: FormulaAST): {
  ast: FormulaAST;
  saved: number;
} {
  const subtreeMap = new Map<string, { node: FormulaAST; count: number }>();
  let saved = 0;

  function serialize(node: FormulaAST): string {
    switch (node.kind) {
      case 'literal':
        return `L:${JSON.stringify(node.value)}`;
      case 'reference':
        return `R:${node.name}`;
      case 'range':
        return `G:${node.start}:${node.end}`;
      case 'op':
        return `O:${node.operator}:${serialize(node.left!)}:${node.right ? serialize(node.right) : ''}`;
      case 'call':
        return `C:${node.name}:${node.args.map(serialize).join(',')}`;
    }
  }

  function dedup(node: FormulaAST): FormulaAST {
    // Only optimize pure expressions (no side effects)
    if (node.kind === 'call') {
      const fn = FUNCTIONS[node.name];
      if (!fn) return node; // Unknown function, keep as-is
    }

    const key = serialize(node);
    const existing = subtreeMap.get(key);

    if (existing && existing.count > 0) {
      // This subtree appears more than once
      existing.count++;
      saved++;
      return existing.node; // Return the canonical node
    }

    subtreeMap.set(key, { node, count: 1 });

    // Recurse into children
    switch (node.kind) {
      case 'op': {
        const left = node.left ? dedup(node.left) : undefined;
        const right = node.right ? dedup(node.right) : undefined;
        if (left !== node.left || right !== node.right) {
          const opNode: Op = { kind: 'op', operator: node.operator };
          if (left !== undefined) opNode.left = left;
          if (right !== undefined) opNode.right = right;
          return opNode;
        }
        return node;
      }
      case 'call': {
        const args = node.args.map(dedup);
        const changed = args.some((a, i) => a !== node.args[i]);
        if (changed) {
          return { kind: 'call', name: node.name, args };
        }
        return node;
      }
      default:
        return node;
    }
  }

  const optimized = dedup(ast);
  return { ast: optimized, saved };
}

// ── internal helpers ─────────────────────────────────────

function tryFoldOp(op: string, left: Literal, right: Literal): Literal | null {
  const l = left.value;
  const r = right.value;

  // Only fold numeric operations
  if (typeof l === 'number' && typeof r === 'number') {
    switch (op) {
      case '+': return { kind: 'literal', value: l + r };
      case '-': return { kind: 'literal', value: l - r };
      case '*': return { kind: 'literal', value: l * r };
      case '/':
        if (r === 0) return null; // Don't fold division by zero
        return { kind: 'literal', value: l / r };
      case '%':
        if (r === 0) return null;
        return { kind: 'literal', value: l % r };
      case '^': return { kind: 'literal', value: Math.pow(l, r) };
      case '=': return { kind: 'literal', value: l === r };
      case '<>': return { kind: 'literal', value: l !== r };
      case '<': return { kind: 'literal', value: l < r };
      case '>': return { kind: 'literal', value: l > r };
      case '<=': return { kind: 'literal', value: l <= r };
      case '>=': return { kind: 'literal', value: l >= r };
    }
  }

  // String concatenation
  if (op === '&' && (typeof l === 'string' || typeof r === 'string')) {
    return { kind: 'literal', value: String(l) + String(r) };
  }

  // Equality on mixed types
  if (op === '=') return { kind: 'literal', value: l === r };
  if (op === '<>') return { kind: 'literal', value: l !== r };

  return null;
}

function tryFoldCall(name: string, args: Literal[]): Literal | null {
  const fn = FUNCTIONS[name];
  if (!fn) return null;

  const argValues: Value[] = args.map((a) => a.value as Value);
  const ctx: EvalContext = { fields: {}, version: 0 };

  try {
    const result = fn(argValues, ctx);
    // Don't fold functions that return Dates (they'd lose reactivity)
    // Since Value doesn't include Date, we check if the result is a Date object
    if (typeof result === 'object' && result !== null && 'getTime' in result) return null;
    return { kind: 'literal', value: result as number | string | boolean | null };
  } catch {
    return null; // Don't fold if the function throws
  }
}
