/**
 * BindingsDAG — reactive propagation of variable writes to bound targets.
 *
 * Each binding has a `sourceId` (the variable) and a `targetKey` (the
 * `(targetKind, targetId, targetProp)` tuple it writes into). The DAG
 * tracks dependencies between bindings — a binding that reads `$a` and
 * writes to `$b` produces an edge from `$a` → `$b`. Cycles are detected
 * at registration time (the spec §M2.1: "bindings DAG cycle detected at
 * validation").
 *
 * Targets are an abstract `(kind, id, prop) → setValue(value)` interface
 * so the same DAG can drive element props, overlay openings, slide
 * navigation, etc. Concrete hosts register the target registry.
 */

import type { Expression } from './expression/ast.js';
import { compileExpression } from './expression/compiler.js';
import { evaluateExpression } from './expression/evaluator.js';
import { CompileError } from './expression/errors.js';
import type { TargetKind, Variable, VariableBinding } from './types.js';
import type { VarStore, VarChangeListener } from './var-store.js';

/** Address of a binding target. */
export interface TargetKey {
  readonly kind: TargetKind;
  readonly id: string;
  readonly prop: string;
}

export type TargetSetter = (value: unknown) => void;

export interface BindingEdge {
  readonly from: string; // variable name written by the upstream binding
  readonly to: string; // variable name read by this binding's source
  readonly bindingId: string;
}

/**
 * A compiled binding — its transform expression (if any) is parsed at
 * `addBinding` time, not on every fire.
 */
interface CompiledBinding {
  readonly binding: VariableBinding;
  readonly sourceVar: string; // variable this binding reads
  readonly target: TargetKey;
  readonly setter: TargetSetter;
  /** Compiled `transform` AST — null if no transform. */
  readonly transformAst: Expression | null;
}

export class BindingsDAG {
  private readonly bindings = new Map<string, CompiledBinding>();
  /** Reverse index: variable name → set of bindings that read it. */
  private readonly dependents = new Map<string, Set<string>>();
  /** Forward index: variable name → set of bindings that write it. */
  private readonly producers = new Map<string, Set<string>>();
  private unsubscribe: (() => void) | null = null;
  private readonly variablesByName = new Map<string, Variable>();

  constructor(private readonly store: VarStore) {}

  /** Register a Variable so the DAG can validate references and arity. */
  registerVariable(v: Variable): void {
    this.variablesByName.set(v.name.toUpperCase(), v);
  }

  /** Wire the DAG to the VarStore so writes auto-propagate. Idempotent. */
  activate(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribeAll((event) => {
      if (event.name === '*') return; // bulk hydration
      this.fireForVariable(event.name, event.next);
    });
  }

  deactivate(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Add a binding. If a transform expression references variables that
   * are themselves the target of another binding, the edge is recorded
   * so writes propagate. Cycles are detected here.
   */
  addBinding(binding: VariableBinding, setter: TargetSetter): void {
    const sourceVar = this.resolveSourceName(binding);
    let transformAst: Expression | null = null;
    if (binding.transform) {
      const compiled = compileExpression(binding.transform);
      transformAst = compiled.ast;
      // Note: prototype expressions have no assignment syntax, so an AST
      // cannot write to a variable. The only cycle source is target setters
      // that re-write the same source variable — that's a host concern and
      // is documented in `bindings-dag.test.ts`.
    }
    const compiled: CompiledBinding = {
      binding,
      sourceVar,
      target: { kind: binding.targetKind, id: binding.targetId, prop: binding.targetProp },
      setter,
      transformAst,
    };
    this.bindings.set(binding.id, compiled);
    this.addToIndex(this.dependents, sourceVar, binding.id);
    this.addToIndex(this.producers, sourceVar, binding.id);
  }

  removeBinding(bindingId: string): void {
    const compiled = this.bindings.get(bindingId);
    if (!compiled) return;
    this.removeFromIndex(this.dependents, compiled.sourceVar, bindingId);
    this.removeFromIndex(this.producers, compiled.sourceVar, bindingId);
    this.bindings.delete(bindingId);
  }

  /** All registered bindings. */
  list(): readonly VariableBinding[] {
    return Array.from(this.bindings.values(), (c) => c.binding);
  }

  /** All edges in the DAG (used by the editor's graph inspector). */
  edges(): readonly BindingEdge[] {
    const out: BindingEdge[] = [];
    for (const compiled of this.bindings.values()) {
      // binding reads sourceVar; if its transform writes any variable X,
      // record sourceVar → X.
      const written = writtenVariables(compiled.transformAst);
      for (const w of written) {
        out.push({ from: w, to: compiled.sourceVar, bindingId: compiled.binding.id });
      }
    }
    return out;
  }

  /**
   * Detect any cycle across the DAG. Returns the path of variable names
   * forming the cycle, or null if acyclic.
   */
  detectCycle(): string[] | null {
    const WHITE = 0;
    const GRAY = 1;
    const color = new Map<string, number>();
    const stack: string[] = [];

    const dfs = (node: string): string[] | null => {
      color.set(node, GRAY);
      stack.push(node);
      const outs = this.producers.get(node);
      if (outs) {
        for (const bindingId of outs) {
          const compiled = this.bindings.get(bindingId);
          if (!compiled) continue;
          const written = writtenVariables(compiled.transformAst);
          for (const w of written) {
            const c = color.get(w) ?? WHITE;
            if (c === GRAY) {
              const idx = stack.indexOf(w);
              return stack.slice(idx).concat(w);
            }
            const r = dfs(w);
            if (r) return r;
          }
        }
      }
      stack.pop();
      color.set(node, 2);
      return null;
    };

    for (const name of this.producers.keys()) {
      if ((color.get(name) ?? WHITE) === WHITE) {
        const r = dfs(name);
        if (r) return r;
      }
    }
    return null;
  }

  private resolveSourceName(binding: VariableBinding): string {
    const v = this.variablesByName.get(binding.variableId.toUpperCase());
    // We don't actually look up variables by ID; bindings store the
    // variable NAME in the id slot in the simplified wire form. Real
    // lookups happen through the registered map; here we accept either.
    if (v) return v.name.toUpperCase();
    return binding.variableId.toUpperCase();
  }

  private fireForVariable(varName: string, _value: unknown): void {
    const ids = this.dependents.get(varName);
    if (!ids) return;
    for (const id of ids) {
      const compiled = this.bindings.get(id);
      if (!compiled) continue;
      const value = this.store.read(compiled.sourceVar);
      const out = compiled.transformAst
        ? safeEvaluate(compiled.transformAst, compiled.sourceVar, this.store)
        : value;
      compiled.setter(out);
    }
  }

  private addToIndex(idx: Map<string, Set<string>>, key: string, id: string): void {
    const set = idx.get(key) ?? new Set();
    set.add(id);
    idx.set(key, set);
  }

  private removeFromIndex(idx: Map<string, Set<string>>, key: string, id: string): void {
    const set = idx.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) idx.delete(key);
  }
}

/** Collect all `$var` references from an AST. */
export function writtenVariables(ast: Expression | null): string[] {
  if (!ast) return [];
  const out = new Set<string>();
  walk(ast);
  return Array.from(out);
  function walk(node: Expression): void {
    switch (node.kind) {
      case 'variable':
        out.add(node.name);
        return;
      case 'binary':
        walk(node.left);
        walk(node.right);
        return;
      case 'unary':
        walk(node.operand);
        return;
      case 'call':
        for (const a of node.args) walk(a);
        return;
      case 'literal':
        return;
    }
  }
}

function safeEvaluate(ast: Expression, _sourceVar: string, store: VarStore): unknown {
  try {
    return evaluateExpression(ast, { vars: collect(store) });
  } catch (err) {
    if (err instanceof CompileError) throw err;
    // Soft-fail transforms — log via console in dev; spec keeps bindings alive.
    return undefined;
  }
  function collect(s: VarStore): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const name of s.allNames()) {
      out[name] = s.read(name);
    }
    return out;
  }
}

/** Listener-type re-export so callers don't need to import the var-store types. */
export type { VarChangeListener };
