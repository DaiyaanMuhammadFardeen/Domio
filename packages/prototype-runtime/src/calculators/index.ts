/**
 * Calculators module — Phase 10 M4.
 *
 * A `CalculatorDef` is a numeric input widget that exposes a derived
 * value to the bindings DAG. The runtime drives the recompute
 * engine so the input/derived pair updates when the bound
 * variable changes.
 */

import { recompute } from './recompute-engine.js';
import { validateCalculatorDef } from './calculator-def.js';

export type {
  CalculatorMode,
  CalculatorValue,
  CalculatorNode,
  CalculatorInput,
  CalculatorOutput,
  CalculatorDef,
  CalculatorState,
} from './calculator-def.js';
export { validateCalculatorDef } from './calculator-def.js';

export {
  CalculatorCycleError,
  CalculatorEvalError,
  recompute,
  irr,
  calculator,
  type ComputeOptions,
  type IRRResult,
} from './recompute-engine.js';

export interface CalculatorRegistration {
  readonly id: string;
  readonly def: import('./calculator-def.js').CalculatorDef;
  readonly createdAt: number;
}

export interface CalculatorVariableSpec {
  readonly calculatorId: string;
  readonly inputId: string;
  readonly variableId: string;
}

export class CalculatorRegistry {
  private readonly store = new Map<string, CalculatorRegistration>();

  register(def: import('./calculator-def.js').CalculatorDef, clock: () => number = Date.now): void {
    validateCalculatorDef(def);
    this.store.set(def.id, { id: def.id, def, createdAt: clock() });
  }

  resolve(id: string): CalculatorRegistration | null {
    return this.store.get(id) ?? null;
  }

  list(): readonly CalculatorRegistration[] {
    return Array.from(this.store.values());
  }

  unregister(id: string): void {
    this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}

export interface RecomputeResult {
  readonly state: import('./calculator-def.js').CalculatorState;
  readonly errors: readonly { readonly nodeId: string; readonly message: string }[];
}

/**
 * `RecomputeEngine` — a thin wrapper around the pure `recompute()`
 * function that caches the last state per calculator id. Keeps the
 * API ergonomic for the editor preview and the bindings DAG.
 */
export class RecomputeEngine {
  private readonly cache = new Map<string, import('./calculator-def.js').CalculatorState>();

  recompute(
    def: import('./calculator-def.js').CalculatorDef,
    inputValues: Readonly<Record<string, number>>,
    opts?: { clock?: () => number },
  ): RecomputeResult {
    const state = recompute(def, inputValues, { clock: opts?.clock });
    this.cache.set(def.id, state);
    return { state, errors: state.errors };
  }

  /** Most recent state for a calculator id (or null). */
  getCached(id: string): import('./calculator-def.js').CalculatorState | null {
    return this.cache.get(id) ?? null;
  }

  clear(): void {
    this.cache.clear();
  }
}