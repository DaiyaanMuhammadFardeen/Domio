/**
 * BindingsDAG tests — registration, propagation, cycle detection.
 */

import { describe, expect, it } from 'vitest';
import { BindingsDAG, writtenVariables } from './bindings-dag.js';
import { VarStore } from './var-store.js';
import type { Variable, VariableBinding } from './types.js';

function makeVar(name: string, scope: Variable['scope'] = 'deck'): Variable {
  return {
    id: name,
    tenantId: 't1',
    deckId: 'd1',
    name,
    scope,
    type: 'string',
    defaultValue: '',
    visibility: 'deck_public',
    readOnly: false,
    version: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeBinding(over: Partial<VariableBinding> & { id: string; variableId: string }): VariableBinding {
  const base = {
    tenantId: 't1',
    deckId: 'd1',
    targetKind: 'element_prop' as const,
    targetId: 'el1',
    targetProp: 'text',
    version: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  // Merge without explicit `undefined` fields (exactOptionalPropertyTypes).
  const merged = { ...base, ...over };
  return merged as VariableBinding;
}

describe('BindingsDAG', () => {
  it('fires setters when the source variable changes', () => {
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('TIER'));
    let captured: unknown = null;
    dag.addBinding(makeBinding({ id: 'b1', variableId: 'TIER' }), (v) => (captured = v));
    dag.activate();
    store.write('TIER', 'annual', { scope: 'deck' });
    expect(captured).toBe('annual');
  });

  it('applies transform expressions to the propagated value', () => {
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('SEATS'));
    let captured: unknown = null;
    dag.addBinding(
      makeBinding({ id: 'b1', variableId: 'SEATS', transform: '$SEATS * 2' }),
      (v) => (captured = v),
    );
    dag.activate();
    store.write('SEATS', 10, { scope: 'deck' });
    expect(captured).toBe(20);
  });

  it('does NOT throw when transform references its source var (read-only ref)', () => {
    // Prototype expressions have no assignment syntax. A transform like
    // '$A + 1' reads A and produces a value; it cannot write back to A.
    // The bindings DAG cannot cycle at the AST level — the only cycles
    // are setter chains, which are a host concern.
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('A'));
    expect(() =>
      dag.addBinding(makeBinding({ id: 'b1', variableId: 'A', transform: '$A + 1' }), () => {}),
    ).not.toThrow();
  });

  it('detectCycle returns null for a graph where transforms only reference external vars', () => {
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('A'));
    dag.registerVariable(makeVar('B'));
    dag.addBinding(makeBinding({ id: 'b1', variableId: 'A', transform: '$B' }), () => {});
    expect(dag.detectCycle()).toBe(null);
  });

  it('detectCycle returns null for a graph with no bindings', () => {
    expect(new BindingsDAG(new VarStore()).detectCycle()).toBe(null);
  });

  it('removeBinding removes from indexes', () => {
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('TIER'));
    dag.addBinding(makeBinding({ id: 'b1', variableId: 'TIER' }), () => {});
    expect(dag.list()).toHaveLength(1);
    dag.removeBinding('b1');
    expect(dag.list()).toHaveLength(0);
  });

  it('activate is idempotent', () => {
    const store = new VarStore();
    const dag = new BindingsDAG(store);
    dag.registerVariable(makeVar('TIER'));
    let count = 0;
    dag.addBinding(makeBinding({ id: 'b1', variableId: 'TIER' }), () => count++);
    dag.activate();
    dag.activate(); // no-op
    store.write('TIER', 'x', { scope: 'deck' });
    expect(count).toBe(1);
    dag.deactivate();
  });

  it('writtenVariables collects all $refs from an AST', () => {
    const ast = {
      kind: 'binary' as const,
      operator: '+' as const,
      left: { kind: 'variable' as const, name: 'A' },
      right: {
        kind: 'call' as const,
        name: 'IF',
        args: [{ kind: 'variable' as const, name: 'B' }, { kind: 'variable' as const, name: 'A' }],
      },
    };
    const names = writtenVariables(ast);
    expect(names.sort()).toEqual(['A', 'B']);
  });

  it('writtenVariables returns empty for null AST', () => {
    expect(writtenVariables(null)).toEqual([]);
  });
});