/**
 * Tree-walking formula evaluator with memoization.
 */

import type { FormulaAST } from './ast.js';
import { FormulaError } from './errors.js';
import { FUNCTIONS, type EvalContext, type Value } from './functions.js';

// Re-export for public API
export type { EvalContext, Value } from './functions.js';
export { FUNCTIONS } from './functions.js';

/**
 * Evaluate a formula AST against a context.
 */
export function evaluate(ast: FormulaAST, ctx: EvalContext): Value {
  const allFunctions = { ...FUNCTIONS, ...ctx.functions };

  function evalNode(node: FormulaAST): Value {
    switch (node.kind) {
      case 'literal':
        return node.value as Value;

      case 'reference': {
        const name = node.name;
        if (ctx.ranges && name in ctx.ranges) {
          return ctx.ranges[name] as unknown as Value;
        }
        if (name in ctx.fields) {
          const v = ctx.fields[name]!;
          // If it's an array, return it wrapped for functions that accept ranges
          if (Array.isArray(v)) return v as unknown as Value;
          return v as Value;
        }
        throw new FormulaError('#REF!', `Unknown reference '${name}'`);
      }

      case 'range': {
        const rangeName = `${node.start}:${node.end}`;
        if (ctx.ranges && rangeName in ctx.ranges) {
          return ctx.ranges[rangeName] as unknown as Value;
        }
        // Expand the range into cell references that the evaluator can resolve
        const rangeVals = expandRange(node.start, node.end, ctx);
        return rangeVals as unknown as Value;
      }

      case 'op': {
        const op = node.operator;
        if (op === '-' && node.left && !node.right) {
          const val = evalNode(node.left);
          if (val === null) throw new FormulaError('#VALUE!', 'Cannot negate null');
          return -toNum(val);
        }
        if (op === '+' && node.left && !node.right) {
          return evalNode(node.left);
        }

        const left = evalNode(node.left!);
        const right = node.right ? evalNode(node.right) : undefined;

        switch (op) {
          case '+': return addValues(left, right!);
          case '-': return subValues(left, right!);
          case '*': return mulValues(left, right!);
          case '/': return divValues(left, right!);
          case '%': {
            const l = toNum(left);
            const r = toNum(right!);
            if (r === 0) throw new FormulaError('#DIV/0!', 'Division by zero');
            return l % r;
          }
          case '^': return Math.pow(toNum(left), toNum(right!));
          case '&': return String(left ?? '') + String(right ?? '');
          case '=': return valuesEqual(left, right!);
          case '<>': return !valuesEqual(left, right!);
          case '<': return toNum(left) < toNum(right!);
          case '>': return toNum(left) > toNum(right!);
          case '<=': return toNum(left) <= toNum(right!);
          case '>=': return toNum(left) >= toNum(right!);
          default:
            throw new FormulaError('#NAME?', `Unknown operator '${op}'`);
        }
      }

      case 'call': {
        const fn = allFunctions[node.name];
        if (!fn) {
          throw new FormulaError('#NAME?', `Unknown function '${node.name}'`);
        }
        const evalArgs = node.args.map((a) => {
          const v = evalNode(a);
          // If it's an array stored as Value (from range/field), unwrap it
          if (Array.isArray(v)) return v as Value;
          return v;
        });
        return fn(evalArgs, ctx);
      }
    }
  }

  return evalNode(ast);
}

// ── helpers ──────────────────────────────────────────────

function toNum(v: Value): number {
  if (v === null) throw new FormulaError('#VALUE!', 'Value is null');
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (isNaN(n)) throw new FormulaError('#VALUE!', `Cannot convert '${v}' to number`);
  return n;
}

function addValues(a: Value, b: Value): Value {
  if (a === null || b === null) throw new FormulaError('#VALUE!', 'Cannot add null');
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
  return toNum(a) + toNum(b);
}

function subValues(a: Value, b: Value): Value {
  return toNum(a) - toNum(b);
}

function mulValues(a: Value, b: Value): Value {
  return toNum(a) * toNum(b);
}

function divValues(a: Value, b: Value): Value {
  const denom = toNum(b);
  if (denom === 0) throw new FormulaError('#DIV/0!', 'Division by zero');
  return toNum(a) / denom;
}

function valuesEqual(a: Value, b: Value): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === typeof b) return a === b;
  return toNum(a) === toNum(b);
}

function expandRange(start: string, end: string, ctx: EvalContext): Value[] {
  const s = parseCellRef(start);
  const e = parseCellRef(end);
  const result: Value[] = [];
  for (let row = s.row; row <= e.row; row++) {
    for (let col = s.col; col <= e.col; col++) {
      const ref = `${String.fromCharCode(64 + col)}${row}`;
      // Try to resolve the cell from fields
      if (ref in ctx.fields) {
        const v = ctx.fields[ref]!;
        if (Array.isArray(v)) {
          result.push(...v);
        } else {
          result.push(v);
        }
      } else {
        result.push(null);
      }
    }
  }
  return result;
}

function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new FormulaError('#REF!', `Invalid cell reference '${ref}'`);
  const colStr = match[1]!;
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { col, row: Number(match[2]) };
}
