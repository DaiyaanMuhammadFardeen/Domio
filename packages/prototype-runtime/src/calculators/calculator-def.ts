/**
 * CalculatorDef — author-time definition of a calculator.
 *
 * Phase 10 M4.2. Two modes:
 *   - `form` mode: implicit DAG (one node per `input`/`output`, one
 *     formula per `output`). Editor allows editing via a flat list.
 *   - `graph` mode: a fully user-shaped DAG where nodes declare their
 *     inputs explicitly and edges express dependencies.
 */

export type CalculatorMode = 'form' | 'graph';

export type CalculatorValue =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean };

export interface CalculatorNode {
  readonly id: string;
  readonly label: string;
  /** Declared inputs to this node — by node id, evaluated first. */
  readonly dependsOn: readonly string[];
  /** Optional inline formula (use `@input` for input value references). */
  readonly formula: string;
  /** Optional override of decimal precision. Defaults to the calc precision. */
  readonly precision?: number;
}

/** Lightweight input declaration for `form` mode. */
export interface CalculatorInput {
  readonly id: string;
  readonly label: string;
  readonly defaultValue: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface CalculatorOutput {
  readonly id: string;
  readonly label: string;
  readonly formula: string;
  /** Format applied to the result. */
  readonly format?: 'number' | 'currency' | 'percent' | 'string';
  readonly locale?: string;
  readonly currency?: string;
}

export interface CalculatorDef {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly mode: CalculatorMode;
  /** Decimal precision (0..18) — used for output rounding. */
  readonly precision: number;
  /** Default locale for currency/percent formatting. */
  readonly locale?: string;
  /** Default currency for currency formatting. */
  readonly currency?: string;
  /** Form-mode: flat input list + output formulas. */
  readonly inputs?: readonly CalculatorInput[];
  readonly outputs?: readonly CalculatorOutput[];
  /** Graph-mode: explicit DAG. */
  readonly nodes?: readonly CalculatorNode[];
  /** Cached state from the last compute — populated by recompute-engine. */
  readonly lastState?: CalculatorState;
}

export interface CalculatorState {
  readonly computedAt: number;
  readonly inputs: Readonly<Record<string, number>>;
  readonly outputs: Readonly<Record<string, number | string>>;
  readonly errors: ReadonlyArray<{ readonly nodeId: string; readonly message: string }>;
}

/** Throw if shape is invalid. */
export function validateCalculatorDef(def: CalculatorDef): void {
  if (!def.id) throw new Error('CalculatorDef.id required');
  if (!def.name || def.name.length < 1 || def.name.length > 128) {
    throw new Error('CalculatorDef.name must be 1..128 chars');
  }
  if (def.mode === 'form') {
    if (!def.inputs || def.inputs.length === 0) {
      throw new Error('form-mode requires at least one input');
    }
    if (!def.outputs || def.outputs.length === 0) {
      throw new Error('form-mode requires at least one output');
    }
    const seen = new Set<string>();
    for (const i of def.inputs) {
      if (seen.has(i.id)) throw new Error(`duplicate input id: ${i.id}`);
      seen.add(i.id);
    }
    const outSeen = new Set<string>();
    for (const o of def.outputs) {
      if (outSeen.has(o.id)) throw new Error(`duplicate output id: ${o.id}`);
      outSeen.add(o.id);
    }
  } else if (def.mode === 'graph') {
    if (!def.nodes || def.nodes.length === 0) {
      throw new Error('graph-mode requires at least one node');
    }
    const seen = new Set<string>();
    for (const n of def.nodes) {
      if (seen.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
      seen.add(n.id);
      if (!n.formula) throw new Error(`node ${n.id} formula required`);
    }
  } else {
    throw new Error(`unknown mode: ${String(def.mode)}`);
  }
  if (def.precision < 0 || def.precision > 18) {
    throw new Error('precision must be 0..18');
  }
}
