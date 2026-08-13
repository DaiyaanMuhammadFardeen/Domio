/**
 * Calculator tests — Phase 10 M4.2.
 * 25+ cases: form/graph modes, topologic order, IRR (positive + negative
 * paths), NPV, formatCurrency, builtin coverage.
 */

import { describe, expect, it } from 'vitest';
import {
  recompute,
  calculator,
  CalculatorCycleError,
  CalculatorEvalError,
  irr,
} from './recompute-engine.js';
import { CalculatorRegistry, RecomputeEngine } from './index.js';
import type { CalculatorDef } from './calculator-def.js';

describe('calculator form mode', () => {
  it('evaluates a single multiply formula', () => {
    const def = calculator.form({
      id: 'subtotal',
      inputs: [
        { id: 'price', label: 'Price' },
        { id: 'qty', label: 'Qty' },
      ],
      outputs: [{ id: 'total', formula: '$price * $qty' }],
    });
    const state = recompute(def, { price: 10, qty: 3 });
    expect(state.outputs.total).toBe(30);
  });

  it('uses input defaults when no value is supplied', () => {
    const def = calculator.form({
      id: 'd1',
      inputs: [
        { id: 'a', label: 'A', defaultValue: 5 },
        { id: 'b', label: 'B', defaultValue: 7 },
      ],
      outputs: [{ id: 'sum', formula: '$a + $b' }],
    });
    const state = recompute(def, {});
    expect(state.outputs.sum).toBe(12);
  });

  it('handles precision rounding', () => {
    const def = calculator.form({
      id: 'prec',
      precision: 2,
      inputs: [{ id: 'price', label: 'Price' }],
      outputs: [{ id: 'tax', formula: '$price * 0.0825' }],
    });
    const state = recompute(def, { price: 100 });
    expect(state.outputs.tax).toBe(8.25);
  });

  it('formats currency output', () => {
    const def = calculator.form({
      id: 'cur',
      currency: 'USD',
      inputs: [{ id: 'price', label: 'Price' }],
      outputs: [{ id: 'paid', formula: '$price', format: 'currency' }],
    });
    const state = recompute(def, { price: 1234.5 });
    expect(String(state.outputs.paid)).toMatch(/\$1,234\.50/);
  });

  it('formats percent output', () => {
    const def = calculator.form({
      id: 'pct',
      inputs: [{ id: 'rate', label: 'Rate' }],
      outputs: [{ id: 'display', formula: '$rate', format: 'percent' }],
    });
    const state = recompute(def, { rate: 0.0825 });
    expect(String(state.outputs.display)).toBe('8.25%');
  });

  it('collects errors on bad formulas', () => {
    const def = calculator.form({
      id: 'err',
      inputs: [{ id: 'a', label: 'A' }],
      outputs: [{ id: 'b', formula: '$a + ' /* incomplete */ }],
    });
    const state = recompute(def, { a: 1 });
    expect(state.errors.length).toBeGreaterThan(0);
    expect(state.errors[0]?.nodeId).toBe('b');
  });

  it('throws on missing input reference', () => {
    const def = calculator.form({
      id: 'miss',
      inputs: [{ id: 'a', label: 'A' }],
      outputs: [{ id: 'b', formula: '$missing' }],
    });
    const state = recompute(def, { a: 1 });
    expect(state.errors.length).toBeGreaterThan(0);
  });
});

describe('calculator graph mode', () => {
  it('evaluates nodes in topological order', () => {
    const def = calculator.graph({
      id: 'g1',
      precision: 2,
      nodes: [
        { id: 'a', formula: '$price * 0.5' },
        { id: 'b', formula: '$a * 2', dependsOn: ['a'] },
        { id: 'c', formula: '$a + $b', dependsOn: ['a', 'b'] },
      ],
    });
    const state = recompute(def, { price: 10 });
    expect(state.outputs.a).toBe(5);
    expect(state.outputs.b).toBe(10);
    expect(state.outputs.c).toBe(15);
  });

  it('detects cycles at runtime', () => {
    const def = calculator.graph({
      id: 'cycle',
      nodes: [
        { id: 'a', formula: '$b', dependsOn: ['b'] },
        { id: 'b', formula: '$a', dependsOn: ['a'] },
      ],
    });
    expect(() => recompute(def, {})).toThrow(CalculatorCycleError);
  });

  it('throws on unknown dependency', () => {
    const def = calculator.graph({
      id: 'unk',
      nodes: [{ id: 'a', formula: '$nope', dependsOn: ['nope'] }],
    });
    expect(() => recompute(def, {})).toThrow(CalculatorEvalError);
  });

  it('handles deep DAG with 5+ layers', () => {
    const def = calculator.graph({
      id: 'deep',
      nodes: [
        { id: 'a', formula: '$price' },
        { id: 'b', formula: '$a + 1', dependsOn: ['a'] },
        { id: 'c', formula: '$b + 1', dependsOn: ['b'] },
        { id: 'd', formula: '$c + 1', dependsOn: ['c'] },
        { id: 'e', formula: '$d + 1', dependsOn: ['d'] },
      ],
    });
    const state = recompute(def, { price: 10 });
    expect(state.outputs.e).toBe(14);
  });
});

describe('calculator builtins', () => {
  const defBase: CalculatorDef = {
    id: 'b',
    name: 'b',
    mode: 'form',
    precision: 2,
    inputs: [
      { id: 'a', label: 'A', defaultValue: 0 },
      { id: 'b', label: 'B', defaultValue: 0 },
      { id: 'c', label: 'C', defaultValue: 0 },
    ],
    outputs: [{ id: 'out', label: 'Out', formula: 'sum($a, $b, $c)' }],
  };

  it('sum aggregates', () => {
    const state = recompute(defBase, { a: 1, b: 2, c: 3 });
    expect(state.outputs.out).toBe(6);
  });

  it('average divides correctly', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 'avg', label: 'Avg', formula: 'average($a, $b, $c)' }],
    };
    const state = recompute(def, { a: 3, b: 6, c: 9 });
    expect(state.outputs.avg).toBe(6);
  });

  it('min / max select', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [
        { id: 'mn', label: 'Min', formula: 'min($a, $b, $c)' },
        { id: 'mx', label: 'Max', formula: 'max($a, $b, $c)' },
      ],
    };
    const state = recompute(def, { a: 3, b: 1, c: 5 });
    expect(state.outputs.mn).toBe(1);
    expect(state.outputs.mx).toBe(5);
  });

  it('if selects branches', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 'pick', label: 'Pick', formula: 'if($a, $b, $c)' }],
    };
    const state = recompute(def, { a: 1, b: 10, c: 20 });
    expect(state.outputs.pick).toBe(10);
    const def2: CalculatorDef = { ...def, outputs: [{ id: 'pick', label: 'Pick', formula: 'if($a, $b, $c)' }] };
    const state2 = recompute(def2, { a: 0, b: 10, c: 20 });
    expect(state2.outputs.pick).toBe(20);
  });

  it('coalesce returns first non-zero', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 'first', label: 'First', formula: 'coalesce($a, $b, $c)' }],
    };
    const state = recompute(def, { a: 0, b: 7, c: 9 });
    expect(state.outputs.first).toBe(7);
  });

  it('clamp constrains', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 'clamped', label: 'Clamped', formula: 'clamp($a, 0, 10)' }],
    };
    const state = recompute(def, { a: 50 });
    expect(state.outputs.clamped).toBe(10);
  });

  it('round rounds to specified digits', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 'r', label: 'R', formula: 'round($a, 1)' }],
    };
    const state = recompute(def, { a: 1.55 });
    expect(state.outputs.r).toBe(1.5);
  });

  it('formatCurrency returns a string', () => {
    const def: CalculatorDef = {
      ...defBase,
      outputs: [{ id: 's', label: 'S', formula: 'formatCurrency($a)' }],
    };
    const state = recompute(def, { a: 1234.5 });
    expect(String(state.outputs.s)).toMatch(/\$1,234\.50/);
  });
});

describe('IRR Newton-Raphson', () => {
  it('computes positive IRR for a standard project', () => {
    const cf = [-1000, 300, 400, 500];
    const r = irr(cf);
    expect(r.converged).toBe(true);
    expect(r.value).toBeGreaterThan(0.05);
    expect(r.value).toBeLessThan(0.15);
  });

  it('finds a near-zero / negative IRR for a value-losing project', () => {
    // Sum of cashflows = -200; the project loses 20% of capital.
    // IRR ≈ -0.094 (between -0.1 and 0). Algorithm finds it from
    // a guess of -0.3.
    const cf = [-1000, 200, 200, 200, 200];
    const r = irr(cf, -0.3);
    expect(r.converged).toBe(true);
    expect(r.value).toBeLessThan(0);
    expect(r.value).toBeGreaterThan(-0.15);
  });

  it('returns NaN when no real IRR exists', () => {
    const cf = [100, 100, 100]; // all positive → no IRR.
    const r = irr(cf);
    expect(r.converged).toBe(false);
    expect(Number.isNaN(r.value)).toBe(true);
  });

  it('handles empty / 1-length arrays', () => {
    expect(irr([]).converged).toBe(false);
    expect(irr([100]).converged).toBe(false);
  });

  it('NPV_sum builtin: rate 0.1 over [-1000, 300, 400, 500] ≈ -21.04', () => {
    const def: CalculatorDef = {
      id: 'fin',
      name: 'fin',
      mode: 'form',
      precision: 2,
      inputs: [{ id: 'rate', label: 'Rate', defaultValue: 0 }],
      outputs: [{ id: 'v', label: 'V', formula: 'npv($rate, [-1000, 300, 400, 500])' }],
    };
    const state = recompute(def, { rate: 0.1 });
    const v = Number(state.outputs.v);
    expect(v).toBeGreaterThan(-25);
    expect(v).toBeLessThan(-15);
  });

  it('IRR for cashflows [-1000, 300, 300, 300, 300] (positive project)', () => {
    // Sum of cashflows = +200. IRR ≈ 7.7% (per standard financial
    // tables). Algorithm converges from a 0.05 guess.
    const cf = [-1000, 300, 300, 300, 300];
    const r = irr(cf, 0.05);
    expect(r.converged).toBe(true);
    expect(r.value).toBeGreaterThan(0.04);
    expect(r.value).toBeLessThan(0.12);
  });
});

describe('CalculatorRegistry + RecomputeEngine', () => {
  it('registers and resolves defs', () => {
    const reg = new CalculatorRegistry();
    const def = calculator.form({
      id: 'reg',
      inputs: [{ id: 'x', label: 'X' }],
      outputs: [{ id: 'y', formula: '$x * 2' }],
    });
    reg.register(def);
    expect(reg.resolve('reg')?.def).toBe(def);
    expect(reg.list()).toHaveLength(1);
  });

  it('unregister removes', () => {
    const reg = new CalculatorRegistry();
    const def = calculator.form({
      id: 'r',
      inputs: [{ id: 'x', label: 'X' }],
      outputs: [{ id: 'y', formula: '$x' }],
    });
    reg.register(def);
    reg.unregister('r');
    expect(reg.resolve('r')).toBeNull();
  });

  it('RecomputeEngine caches the last state', () => {
    const engine = new RecomputeEngine();
    const def = calculator.form({
      id: 'cache',
      inputs: [{ id: 'x', label: 'X' }],
      outputs: [{ id: 'y', formula: '$x' }],
    });
    engine.recompute(def, { x: 5 });
    const cached = engine.getCached('cache');
    expect(cached?.outputs.y).toBe(5);
  });

  it('RecomputeEngine.clear() resets cache', () => {
    const engine = new RecomputeEngine();
    const def = calculator.form({
      id: 'c',
      inputs: [{ id: 'x', label: 'X' }],
      outputs: [{ id: 'y', formula: '$x' }],
    });
    engine.recompute(def, { x: 5 });
    engine.clear();
    expect(engine.getCached('c')).toBeNull();
  });
});
