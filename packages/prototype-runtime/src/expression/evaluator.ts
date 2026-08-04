/**
 * Pure-tree-walking evaluator for compiled expressions.
 *
 * Defense-in-depth sandbox (per Phase 10 spec §M2.2):
 *   - Step counter (default 5,000) — caps total AST node visits.
 *   - Recursion depth cap (default 64).
 *   - Wall-clock budget (default 5 ms).
 *   - Pure AST walker — no `eval`, `Function`, dynamic property access.
 *
 * The per-frame 5 ms budget is enforced via `Date.now()` deltas; the
 * worker-offload hook (Phase 15) will be the production path for hot
 * expressions, but in-process evaluation is sufficient for editor
 * preview and tests.
 */

import type { Expression } from './ast.js';
import { BUILTINS } from './builtins.js';
import {
  DivisionByZeroError,
  ExpressionError,
  StackOverflowError,
  TimeoutError,
  ValueError,
} from './errors.js';

export interface EvalCaps {
  /** Max AST node visits (default 5,000). */
  readonly maxSteps: number;
  /** Max recursion depth (default 64). */
  readonly maxDepth: number;
  /** Wall-clock budget in ms (default 5). */
  readonly maxRuntimeMs: number;
}

export const DEFAULT_EVAL_CAPS: EvalCaps = Object.freeze({
  maxSteps: 5_000,
  maxDepth: 64,
  maxRuntimeMs: 5,
});

export interface EvalContext {
  /** Variable store map — name (uppercased) → value. */
  readonly vars: Readonly<Record<string, unknown>>;
  /** Optional callbacks for ad-hoc bindings. */
  readonly functions?: Readonly<Record<string, (args: readonly unknown[]) => unknown>>;
  /** Caps override. */
  readonly caps?: Partial<EvalCaps>;
  /** Optional clock — tests inject a fixed function. */
  readonly now?: () => number;
}

export interface EvalResult {
  readonly value: unknown;
  readonly steps: number;
  readonly elapsedMs: number;
}

export function evaluateExpression(ast: Expression, ctx: EvalContext): unknown {
  const result = evaluateExpressionWithMetrics(ast, ctx);
  return result.value;
}

export function evaluateExpressionWithMetrics(ast: Expression, ctx: EvalContext): EvalResult {
  const caps = { ...DEFAULT_EVAL_CAPS, ...(ctx.caps ?? {}) };
  const clock = ctx.now ?? (() => Date.now());
  const startedAt = clock();
  const state = { steps: 0, depth: 0 };
  const value = walk(ast, ctx, caps, clock, startedAt, state);
  return { value, steps: state.steps, elapsedMs: clock() - startedAt };
}

function walk(
  node: Expression,
  ctx: EvalContext,
  caps: EvalCaps,
  clock: () => number,
  startedAt: number,
  state: { steps: number; depth: number },
): unknown {
  if (state.depth > caps.maxDepth) throw new StackOverflowError();
  if (++state.steps > caps.maxSteps) {
    throw new ExpressionError('#TIMEOUT!', `Expression exceeded ${caps.maxSteps} step cap`);
  }
  if (clock() - startedAt > caps.maxRuntimeMs) throw new TimeoutError();

  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'variable': {
      if (!(node.name in ctx.vars)) {
        // Variables that aren't set behave as `null` (rather than throwing)
        // so authoring can reference them before they exist; the bindings
        // DAG will rerun once they're written.
        return null;
      }
      return ctx.vars[node.name];
    }

    case 'binary': {
      state.depth++;
      try {
        const l = walk(node.left, ctx, caps, clock, startedAt, state);
        const r = walk(node.right, ctx, caps, clock, startedAt, state);
        return applyBinary(node.operator, l, r);
      } finally {
        state.depth--;
      }
    }

    case 'unary': {
      state.depth++;
      try {
        const v = walk(node.operand, ctx, caps, clock, startedAt, state);
        if (node.operator === '!') return !truthy(v);
        return -toNumber(v, 'unary -');
      } finally {
        state.depth--;
      }
    }

    case 'call': {
      state.depth++;
      try {
        const evaledArgs: unknown[] = [];
        for (const arg of node.args) {
          evaledArgs.push(walk(arg, ctx, caps, clock, startedAt, state));
        }
        const builtin = BUILTINS[node.name];
        const userFn = ctx.functions?.[node.name];
        if (builtin) return builtin.fn(evaledArgs);
        if (userFn) return userFn(evaledArgs);
        throw new ValueError(`Unknown function '${node.name}'`);
      } finally {
        state.depth--;
      }
    }

    default: {
      const _exhaustive: never = node;
      void _exhaustive;
      throw new ValueError(`Unknown AST node kind`);
    }
  }
}

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '==':
      return eq(l, r);
    case '!=':
      return !eq(l, r);
    case '<':
      return cmp(l, r) < 0;
    case '<=':
      return cmp(l, r) <= 0;
    case '>':
      return cmp(l, r) > 0;
    case '>=':
      return cmp(l, r) >= 0;
    case '&&':
      return truthy(l) && r;
    case '||':
      return truthy(l) ? l : r;
    case '+':
      if (typeof l === 'string' || typeof r === 'string') return String(l ?? '') + String(r ?? '');
      if (typeof l === 'number' && typeof r === 'number') return l + r;
      if (l === null || r === null) return null;
      return toNumber(l, '+') + toNumber(r, '+');
    case '-':
      return toNumber(l, '-') - toNumber(r, '-');
    case '*':
      return toNumber(l, '*') * toNumber(r, '*');
    case '/': {
      const divisor = toNumber(r, '/');
      if (divisor === 0) throw new DivisionByZeroError();
      return toNumber(l, '/') / divisor;
    }
    case '%': {
      const divisor = toNumber(r, '%');
      if (divisor === 0) throw new DivisionByZeroError();
      return toNumber(l, '%') % divisor;
    }
    default:
      throw new ValueError(`Unknown operator '${op}'`);
  }
}

function eq(a: unknown, b: unknown): boolean {
  // Object.is is the spec; covers NaN and -0/+0.
  return Object.is(a, b);
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return String(a ?? '') < String(b ?? '')
    ? -1
    : String(a ?? '') > String(b ?? '')
      ? 1
      : 0;
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function toNumber(v: unknown, ctx: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isNaN(n)) throw new ValueError(`${ctx}: cannot convert '${v}' to number`);
    return n;
  }
  throw new ValueError(`${ctx}: cannot convert ${typeof v} to number`);
}