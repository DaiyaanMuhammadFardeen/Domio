/**
 * RecomputeEngine — topological propagation through a calculator DAG.
 *
 * Phase 10 M4.2. Cycles are detected at author time
 * (`validateCalculatorDef`) AND at runtime as a guard. Builtins are
 * sandboxed: no `eval`, no I/O, no globals.
 */

import {
  add as decAdd,
  sub as decSub,
  mul as decMul,
  div as decDiv,
  round as decRound,
  formatCurrency as decFormatCurrency,
} from '@domio/decimal128';
import type {
  CalculatorDef,
  CalculatorInput,
  CalculatorNode,
  CalculatorOutput,
  CalculatorState,
} from './calculator-def.js';
import { validateCalculatorDef } from './calculator-def.js';

export class CalculatorCycleError extends Error {
  readonly code = 'CALCULATOR_CYCLE' as const;
  constructor(public readonly cyclePath: readonly string[]) {
    super(`Cycle detected in calculator DAG: ${cyclePath.join(' -> ')}`);
    this.name = 'CalculatorCycleError';
  }
}

export class CalculatorEvalError extends Error {
  readonly code = 'CALCULATOR_EVAL_ERROR' as const;
  constructor(
    public readonly nodeId: string,
    message: string,
  ) {
    super(`Calculator node ${nodeId} failed: ${message}`);
    this.name = 'CalculatorEvalError';
  }
}

export interface ComputeOptions {
  readonly now?: () => number;
  readonly clock?: () => number;
  /** Override input values for form-mode recalculation. */
  readonly inputsOverride?: Readonly<Record<string, number>>;
}

/**
 * Test/author helper — builds a `form`-mode `CalculatorDef` with a
 * sensible default `name` (`<id>`) and `precision` (2).
 */
export const calculator = {
  form(spec: {
    id: string;
    name?: string;
    precision?: number;
    currency?: string;
    locale?: string;
    inputs: ReadonlyArray<
      Partial<CalculatorInput> & {
        readonly id: string;
        defaultValue?: number;
      }
    >;
    outputs: ReadonlyArray<
      Partial<CalculatorOutput> & {
        readonly id: string;
        readonly formula: string;
      }
    >;
  }): CalculatorDef {
    return {
      id: spec.id,
      name: spec.name ?? spec.id,
      mode: 'form',
      precision: spec.precision ?? 2,
      ...(spec.currency !== undefined ? { currency: spec.currency } : {}),
      ...(spec.locale !== undefined ? { locale: spec.locale } : {}),
      inputs: spec.inputs.map((i) => ({
        id: i.id,
        label: i.label ?? i.id,
        defaultValue: i.defaultValue ?? 0,
        ...(i.min !== undefined ? { min: i.min } : {}),
        ...(i.max !== undefined ? { max: i.max } : {}),
        ...(i.step !== undefined ? { step: i.step } : {}),
      })),
      outputs: spec.outputs.map((o) => ({
        id: o.id,
        label: o.label ?? o.id,
        formula: o.formula,
        ...(o.format !== undefined ? { format: o.format } : {}),
        ...(o.locale !== undefined ? { locale: o.locale } : {}),
        ...(o.currency !== undefined ? { currency: o.currency } : {}),
      })),
    };
  },
  graph(spec: {
    id: string;
    name?: string;
    precision?: number;
    nodes: ReadonlyArray<
      Partial<CalculatorNode> & {
        readonly id: string;
        readonly formula: string;
        dependsOn?: readonly string[];
      }
    >;
  }): CalculatorDef {
    return {
      id: spec.id,
      name: spec.name ?? spec.id,
      mode: 'graph',
      precision: spec.precision ?? 2,
      nodes: spec.nodes.map((n) => ({
        id: n.id,
        label: n.label ?? n.id,
        formula: n.formula,
        dependsOn: n.dependsOn ?? [],
        ...(n.precision !== undefined ? { precision: n.precision } : {}),
      })),
    };
  },
};

const DEFAULT_NOW = (): number => Date.now();

/**
 * Recompute the calculator state given the latest input values.
 *
 * - For `form` mode: outputs are formulas over `inputs.<id>` plus the
 *   shared builtins (`sum`, `average`, `round`, `formatCurrency`, ...).
 *   The "DAG" is implicit: outputs depend on all inputs they reference.
 * - For `graph` mode: nodes are evaluated in topological order over
 *   `nodes[*].dependsOn`. Cycles throw.
 */
export function recompute(
  def: CalculatorDef,
  inputs: Readonly<Record<string, number>> = {},
  opts: ComputeOptions = {},
): CalculatorState {
  validateCalculatorDef(def);
  const now = (opts.now ?? DEFAULT_NOW)();
  if (def.mode === 'form') {
    return recomputeForm(
      def,
      def.inputs!,
      def.outputs!,
      { ...inputs, ...(opts.inputsOverride ?? {}) },
      now,
    );
  }
  return recomputeGraph(def, def.nodes!, { ...inputs, ...(opts.inputsOverride ?? {}) }, now);
}

function recomputeForm(
  def: CalculatorDef,
  inputs: readonly CalculatorInput[],
  outputs: readonly CalculatorOutput[],
  values: Readonly<Record<string, number>>,
  now: number,
): CalculatorState {
  const normalized: Record<string, number> = {};
  for (const inp of inputs) {
    normalized[inp.id] =
      typeof values[inp.id] === 'number' && Number.isFinite(values[inp.id]!)
        ? values[inp.id]!
        : (inp.defaultValue ?? 0);
  }
  const ctx: RecomputeContext = {
    inputs: normalized,
    nodes: normalized,
    precision: def.precision,
    locale: def.locale ?? 'en-US',
    currency: def.currency ?? 'USD',
  };
  const errors: { nodeId: string; message: string }[] = [];
  const outputValues: Record<string, number | string> = {};
  for (const out of outputs) {
    try {
      outputValues[out.id] = evaluateOutput(out, ctx);
    } catch (e) {
      errors.push({ nodeId: out.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { computedAt: now, inputs: normalized, outputs: outputValues, errors };
}

function recomputeGraph(
  def: CalculatorDef,
  nodes: readonly CalculatorNode[],
  values: Readonly<Record<string, number>>,
  now: number,
): CalculatorState {
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!ids.has(dep) && !(dep in values)) {
        throw new CalculatorEvalError(n.id, `unknown dependency ${dep}`);
      }
    }
  }

  const nodeValues: Record<string, number> = {};
  const baseCtx: RecomputeContext = {
    inputs: values,
    nodes: nodeValues,
    precision: def.precision,
    locale: def.locale ?? 'en-US',
    currency: def.currency ?? 'USD',
  };
  const errors: { nodeId: string; message: string }[] = [];
  const outputValues: Record<string, number | string> = {};
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycleStack: string[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new CalculatorCycleError([...cycleStack, id]);
    }
    const node = nodes.find((n) => n.id === id);
    if (!node) {
      throw new CalculatorEvalError(id, 'node not found');
    }
    visiting.add(id);
    cycleStack.push(id);
    for (const dep of node.dependsOn) {
      if (!visited.has(dep)) visit(dep);
    }
    try {
      const args = Object.fromEntries(
        node.dependsOn.map((d) => [
          d,
          nodeValues[d] !== undefined ? nodeValues[d]! : (values[d] ?? 0),
        ]),
      );
      const result = evalFormula(node.formula, { ...args, ...values, ctx: baseCtx });
      const rounded =
        (node.precision ?? def.precision) > 0
          ? Number(decRound(Number(result), node.precision ?? def.precision).value)
          : Number(result);
      nodeValues[id] = rounded;
      outputValues[id] = rounded;
    } catch (e) {
      errors.push({ nodeId: id, message: e instanceof Error ? e.message : String(e) });
    }
    cycleStack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const n of nodes) visit(n.id);

  return { computedAt: now, inputs: values, outputs: outputValues, errors };
}

interface RecomputeContext {
  readonly inputs: Readonly<Record<string, number>>;
  readonly nodes: Readonly<Record<string, number>>;
  readonly precision: number;
  readonly locale: string;
  readonly currency: string;
}

function evaluateOutput(out: CalculatorOutput, ctx: RecomputeContext): number | string {
  const raw = evalFormula(out.formula, ctx);
  // If the formula itself returned a string (e.g., via formatCurrency
  // builtin), honor it directly — don't re-round or reformat.
  if (typeof raw === 'string') return raw;
  // Bare array literal as an output formula is a user error — return a
  // stringified marker so the form still renders something meaningful.
  if (Array.isArray(raw)) return String(raw);
  // From here `raw` is narrowed to `number`.
  const num = raw as number;
  // Apply format-specific handling BEFORE precision rounding so that
  // percent / currency / string see the raw computed value.
  if (out.format === 'currency') {
    return decFormatCurrency(num, out.currency ?? ctx.currency, out.locale ?? ctx.locale);
  }
  if (out.format === 'percent') {
    return `${(num * 100).toFixed(2)}%`;
  }
  if (out.format === 'string') return String(num);
  // Default numeric path: round to the calc's precision.
  if (ctx.precision > 0) {
    return Number(decRound(String(num), ctx.precision).value);
  }
  return num;
}

// ── Formula mini-language ──────────────────────────────────────────────
//
// Grammar: a formula string is a comma-separated list of numeric
// values or named-input references (`$<id>`), combined with `+`, `-`,
// `*`, `/`, parens, and one identifier per builtin. Numbers may be
// decimal. Whitespace is ignored.
//
// Examples:
//   "$price * $qty"
//   "sum($a, $b, $c) - $discount"
//   "formatCurrency($total)"
//
// `evalFormula` returns `number | string` (formatting produces strings).

// BUILTINS is keyed by lowercase identifier; the parser calls
// `tk.toLowerCase()` to look up. This keeps the public formula DSL
// case-insensitive without surprising users about camelCase vs all-lowercase.
const BUILTINS: Readonly<
  Record<
    string,
    {
      arity: number | 'min';
      fn: (
        args: ReadonlyArray<number | string | readonly number[]>,
        ctx: RecomputeContext,
      ) => number | string | readonly number[];
    }
  >
> = {
  sum: {
    arity: 'min',
    fn: (a) => {
      let s = 0;
      for (const x of a) {
        if (Array.isArray(x)) continue;
        s = Number(decAdd(s, Number(x)).value);
      }
      return s;
    },
  },
  average: {
    arity: 'min',
    fn: (a) => {
      const nums: number[] = [];
      for (const x of a) {
        if (Array.isArray(x)) continue;
        nums.push(Number(x));
      }
      if (nums.length === 0) return 0;
      const total = nums.reduce((s, x) => Number(decAdd(s, x).value), 0);
      return Number(div(total, nums.length));
    },
  },
  min: {
    arity: 'min',
    fn: (a) => {
      let m = Number.POSITIVE_INFINITY;
      for (const x of a) {
        if (Array.isArray(x)) continue;
        const n = Number(x);
        if (n < m) m = n;
      }
      return m;
    },
  },
  max: {
    arity: 'min',
    fn: (a) => {
      let m = Number.NEGATIVE_INFINITY;
      for (const x of a) {
        if (Array.isArray(x)) continue;
        const n = Number(x);
        if (n > m) m = n;
      }
      return m;
    },
  },
  if: { arity: 3, fn: (args) => (Number(args[0]) !== 0 ? args[1] : args[2])! },
  coalesce: {
    arity: 'min',
    fn: (a) => {
      for (const x of a) {
        if (Array.isArray(x)) continue;
        const n = Number(x);
        if (n !== 0 && Number.isFinite(n)) return n;
      }
      return 0;
    },
  },
  clamp: {
    arity: 3,
    fn: ([v, lo, hi]) => Math.min(Number(hi), Math.max(Number(lo), Number(v))),
  },
  // Use 'half-down' so 1.55 rounds to 1.5 (matches the most
  // user-friendly intuition; 0.5 always rounds toward zero).
  // decimal128's default is banker's rounding (1.55 → 1.6).
  round: {
    arity: 'min',
    fn: (a) => {
      const v = a[0];
      const digits = a[1];
      return Number(decRound(Number(v ?? 0), Number(digits ?? 0), 'half-down').value);
    },
  },
  formatcurrency: {
    arity: 'min',
    fn: (a, ctx) => decFormatCurrency(Number(a[0]), ctx.currency, ctx.locale),
  },
  // Finance
  irr: { arity: 1, fn: (a) => irr(a[0] as readonly number[]).value },
  npv: {
    arity: 2,
    fn: ([rate, cashflows]) => {
      const cfArr = cashflows as readonly number[];
      let total = 0;
      for (let i = 0; i < cfArr.length; i++) {
        const cf = cfArr[i] ?? 0;
        total = Number(decAdd(total, Number(div(cf, Math.pow(1 + Number(rate), i)))).value);
      }
      return total;
    },
  },
};

function evalFormula(
  src: string,
  ctx: RecomputeContext | RecomputeContextWithSelf,
): number | string | readonly number[] {
  const tokens = tokenize(src);
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const consume = (): string | undefined => tokens[i++];
  const ctxFinal: RecomputeContext = 'ctx' in ctx ? ctx.ctx : (ctx as RecomputeContext);

  const parseExpr = (): number | string | readonly number[] => parseAddSub();

  const parseAddSub = (): number | string | readonly number[] => {
    let left: number | string | readonly number[] = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right: number | string | readonly number[] = parseMulDiv();
      left =
        op === '+'
          ? Number(decAdd(Number(left), Number(right)).value)
          : Number(decSub(Number(left), Number(right)).value);
    }
    return left;
  };

  const parseMulDiv = (): number | string | readonly number[] => {
    let left: number | string | readonly number[] = parseUnary();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right: number | string | readonly number[] = parseUnary();
      left =
        op === '*'
          ? Number(decMul(Number(left), Number(right)).value)
          : Number(div(Number(left), Number(right)));
    }
    return left;
  };

  const parseUnary = (): number | string | readonly number[] => {
    if (peek() === '-') {
      consume();
      return -Number(parseUnary());
    }
    if (peek() === '+') {
      consume();
      return Number(parseUnary());
    }
    return parsePrimary();
  };

  const parsePrimary = (): number | string | readonly number[] => {
    const tk = consume();
    if (tk === undefined) throw new CalculatorEvalError('<expr>', 'unexpected end of input');
    if (tk === '(') {
      const v = parseExpr();
      const close = consume();
      if (close !== ')') throw new CalculatorEvalError('<expr>', 'missing closing paren');
      return v;
    }
    if (tk === '[') {
      // Array literal: `[1, 2, 3]`. Returns a `readonly number[]`.
      const items: number[] = [];
      if (peek() !== ']') {
        items.push(Number(parseExpr()));
        while (peek() === ',') {
          consume();
          items.push(Number(parseExpr()));
        }
      }
      const close = consume();
      if (close !== ']') throw new CalculatorEvalError('<expr>', 'missing closing bracket');
      return items;
    }
    if (/^\d+(\.\d+)?$/.test(tk)) return Number(tk);
    if (tk.startsWith('$')) {
      const name = tk.slice(1);
      if (name in ctxFinal.inputs) return ctxFinal.inputs[name]!;
      if (name in ctxFinal.nodes) return ctxFinal.nodes[name]!;
      throw new CalculatorEvalError(name, 'unknown input/node');
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tk)) {
      // function call
      const open = consume();
      if (open !== '(') throw new CalculatorEvalError(tk, 'function call expected');
      // Args may be numbers, strings, or array literals (`[1, 2, 3]`).
      const args: Array<number | string | readonly number[]> = [];
      if (peek() !== ')') {
        args.push(parseExpr());
        while (peek() === ',') {
          consume();
          args.push(parseExpr());
        }
      }
      const close = consume();
      if (close !== ')') throw new CalculatorEvalError(tk, 'missing closing paren');
      const def = BUILTINS[tk.toLowerCase()];
      if (!def) throw new CalculatorEvalError(tk, 'unknown function');
      if (def.arity !== 'min' && def.arity !== args.length) {
        throw new CalculatorEvalError(tk, `expected ${def.arity} args, got ${args.length}`);
      }
      return def.fn(args, ctxFinal);
    }
    throw new CalculatorEvalError(tk, `unexpected token: ${tk}`);
  };

  return parseExpr();
}

interface RecomputeContextWithSelf {
  readonly ctx: RecomputeContext;
}

function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (
      c === ',' ||
      c === '(' ||
      c === ')' ||
      c === '[' ||
      c === ']' ||
      c === '+' ||
      c === '-' ||
      c === '*' ||
      c === '/'
    ) {
      out.push(c);
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src.charAt(j))) j++;
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '$' || /[A-Za-z_]/.test(c)) {
      let j = i;
      // Identifier may include `$` (for `$inputName`).
      while (j < src.length && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
      out.push(src.slice(i, j));
      i = j;
      continue;
    }
    throw new CalculatorEvalError(`<tokenize>`, `unexpected character '${c}'`);
  }
  return out;
}

// ── IRR / NPV helpers ───────────────────────────────────────────────────
//
// Exposed as test helpers — callers should use the `irr()` and `npv()`
// builtins above for runtime computation.

export interface IRRResult {
  readonly value: number;
  readonly converged: boolean;
  readonly iterations: number;
}

/** IRR via Newton-Raphson. Falls back to bisection. */
export function irr(cashflows: readonly number[], guess = 0.1): IRRResult {
  if (cashflows.length < 2) return { value: 0, converged: false, iterations: 0 };
  let rate = guess;
  let iter = 0;
  const maxIter = 200;
  const eps = 1e-7;
  while (iter < maxIter) {
    const { npv, dnpv } = npvAndDeriv(rate, cashflows);
    if (Math.abs(npv) < eps) return { value: rate, converged: true, iterations: iter };
    if (dnpv === 0) break;
    const next = rate - npv / dnpv;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < eps) return { value: next, converged: true, iterations: iter + 1 };
    rate = next;
    iter++;
    if (rate < -0.999999) rate = -0.999999;
  }
  // Negative-IRR path: bisection over [-0.9999, 1.0].
  let lo = -0.9999,
    hi = 1.0;
  let flo = npvAndDeriv(lo, cashflows).npv,
    fhi = npvAndDeriv(hi, cashflows).npv;
  if (flo * fhi > 0) return { value: NaN, converged: false, iterations: iter };
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = npvAndDeriv(mid, cashflows).npv;
    if (Math.abs(fm) < eps) return { value: mid, converged: true, iterations: iter + k };
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return { value: rate, converged: false, iterations: iter };
}

function npvAndDeriv(rate: number, cashflows: readonly number[]): { npv: number; dnpv: number } {
  let npv = 0;
  let dnpv = 0;
  for (let i = 0; i < cashflows.length; i++) {
    const cf = cashflows[i] ?? 0;
    const disc = Math.pow(1 + rate, i);
    npv += cf / disc;
    if (i > 0) dnpv += (-i * cf) / Math.pow(1 + rate, i + 1);
  }
  return { npv, dnpv };
}

// Reuse decimal128 for divide so 1/x stays precise. For an internal
// helper that needs a single scalar, we wrap decDiv. `decDiv` returns a
// DecResult envelope — pull `.value` before `Number()` to avoid NaN.
function div(a: number, b: number): number {
  return Number(decDiv(a, b).value);
}
