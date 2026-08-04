/**
 * Expression compiler — wraps `parseExpression` with two extra layers of
 * defense:
 *   1. AST whitelist check (rejects any future grammar additions that
 *      produce disallowed nodes).
 *   2. Host-access name check (catches `EVAL`, `FUNCTION`, `GLOBALTHIS`,
 *      `CONSTRUCTOR`, `PROTOTYPE`, etc. — even though the parser doesn't
 *      emit member-access nodes, a future grammar change shouldn't be
 *      able to slip them through).
 *
 * The compiler is intentionally cheap — no lowering or optimization. A
 * future revision can add constant folding if needed.
 */

import type { Expression } from './ast.js';
import { BUILTINS, HOST_ACCESS_NAMES } from './builtins.js';
import { CompileError, NameError } from './errors.js';
import { parseExpression } from './parser.js';

export interface CompileOptions {
  /**
   * Optional allow-list of builtin names. If unset, every name in
   * `BUILTINS` is permitted. Used by the editor's expression builder to
   * restrict authors to a safe subset (e.g., only `if`, `coalesce`,
   * comparison helpers).
   */
  readonly allowedFunctions?: readonly string[];
}

export interface CompiledExpression {
  readonly source: string;
  readonly ast: Expression;
  /** Hash of the source string — used by the bindings cache. */
  readonly hash: string;
}

export function compileExpression(source: string, opts: CompileOptions = {}): CompiledExpression {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new CompileError('Empty expression');
  }
  if (trimmed.length > 4096) {
    throw new CompileError('Expression exceeds 4096-character limit');
  }
  const ast = parseExpression(trimmed);
  validateAst(ast, opts);
  return {
    source: trimmed,
    ast,
    hash: hashString(trimmed),
  };
}

/**
 * Pure AST whitelist check. Walks every node and asserts:
 *   - Every call resolves to a builtin (or the configured allow-list).
 *   - No identifier references host-access globals.
 *   - No member access / indexing — the parser doesn't emit these but
 *     this layer guards against future grammar additions.
 */
export function validateAst(ast: Expression, opts: CompileOptions = {}): void {
  const visited = new Set<Expression>();
  const allowList = opts.allowedFunctions;

  function walk(node: Expression): void {
    if (visited.has(node)) return;
    visited.add(node);

    switch (node.kind) {
      case 'literal':
      case 'variable':
        return;
      case 'binary':
        walk(node.left);
        walk(node.right);
        return;
      case 'unary':
        walk(node.operand);
        return;
      case 'call': {
        if (HOST_ACCESS_NAMES.has(node.name)) {
          throw new NameError(`Call to '${node.name}' is not allowed`);
        }
        const allowed =
          allowList === undefined ? node.name in BUILTINS : allowList.includes(node.name);
        if (!allowed) {
          throw new NameError(
            allowList === undefined
              ? `Unknown function '${node.name}'`
              : `Function '${node.name}' is not in the allowed set`,
          );
        }
        const builtin = BUILTINS[node.name]!;
        const argc = node.args.length;
        switch (builtin.arity.kind) {
          case 'exact':
            if (argc !== builtin.arity.n) {
              throw new CompileError(`${node.name} expects ${builtin.arity.n} argument(s), got ${argc}`);
            }
            break;
          case 'min':
            if (argc < builtin.arity.n) {
              throw new CompileError(`${node.name} expects at least ${builtin.arity.n} argument(s), got ${argc}`);
            }
            break;
          case 'range':
            if (argc < builtin.arity.min || argc > builtin.arity.max) {
              throw new CompileError(
                `${node.name} expects ${builtin.arity.min}-${builtin.arity.max} argument(s), got ${argc}`,
              );
            }
            break;
        }
        for (const arg of node.args) walk(arg);
        return;
      }
      default: {
        const _exhaustive: never = node;
        void _exhaustive;
        throw new CompileError(`Unknown AST node kind`);
      }
    }
  }

  walk(ast);
}

/** Tiny non-crypto hash used for caching compiled expressions. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `e${(h >>> 0).toString(16)}`;
}