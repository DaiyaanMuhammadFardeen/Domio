/**
 * Tests for incremental recomputation.
 */

import { describe, it, expect, vi } from 'vitest';
import { FormulaDependencyGraph } from './dag.js';
import { incrementalRecompute } from './incremental.js';
import { evaluate, type EvalContext, type Value } from './evaluate.js';
import { parseFormula } from './parser.js';

describe('incrementalRecompute', () => {
  it('returns changed fields when no downstream dependents', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('A', '1');
    graph.addField('B', '2');

    const dirty = incrementalRecompute(graph, ['A']);
    expect(dirty).toContain('A');
    expect(dirty).not.toContain('B');
  });

  it('includes downstream dependents of changed field', () => {
    const g = new FormulaDependencyGraph();
    g.addField('B', '10');
    g.addField('A', 'B + 1');

    const dirty = incrementalRecompute(g, ['B']);
    expect(dirty).toContain('B');
    expect(dirty).toContain('A');
  });

  it('propagates through a chain', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('C', '10');
    graph.addField('B', 'C * 2');
    graph.addField('A', 'B + 5');

    const dirty = incrementalRecompute(graph, ['C']);
    expect(dirty).toContain('C');
    expect(dirty).toContain('B');
    expect(dirty).toContain('A');
  });

  it('preserves dependency order in result', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('C', '10');
    graph.addField('B', 'C * 2');
    graph.addField('A', 'B + 5');

    const dirty = incrementalRecompute(graph, ['C']);
    // C before B, B before A
    expect(dirty.indexOf('C')).toBeLessThan(dirty.indexOf('B'));
    expect(dirty.indexOf('B')).toBeLessThan(dirty.indexOf('A'));
  });

  it('does not include unrelated fields', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('B', '10');
    graph.addField('A', 'B + 1');
    graph.addField('X', '100');
    graph.addField('Y', 'X * 2');

    const dirty = incrementalRecompute(graph, ['B']);
    expect(dirty).toContain('B');
    expect(dirty).toContain('A');
    expect(dirty).not.toContain('X');
    expect(dirty).not.toContain('Y');
  });

  it('handles multiple changed fields', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('B', '10');
    graph.addField('C', '20');
    graph.addField('A', 'B + C');

    const dirty = incrementalRecompute(graph, ['B', 'C']);
    expect(dirty).toContain('B');
    expect(dirty).toContain('C');
    expect(dirty).toContain('A');
  });

  it('returns empty array when no fields changed', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('A', '1');

    const dirty = incrementalRecompute(graph, []);
    expect(dirty).toHaveLength(0);
  });

  it('only re-evaluates downstream formulas (with spy)', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('B', '10');
    graph.addField('A', 'B + 1');

    // Spy on evaluate calls
    const evaluateSpy = vi.fn();
    const fields: Record<string, Value> = { B: 10 };

    // Simulate incremental recompute
    const dirtyFields = incrementalRecompute(graph, ['B']);

    // Manually evaluate only dirty fields in order
    for (const fieldId of dirtyFields) {
      const deps = graph.getDependencies(fieldId);
      const evalCtx: EvalContext = { fields, version: 0 };
      for (const dep of deps) {
        if (dep in fields) {
          evalCtx.fields[dep] = fields[dep]!;
        }
      }
      const ast = parseFormula(fieldId === 'B' ? '10' : 'B + 1');
      const result = evaluate(ast, evalCtx);
      fields[fieldId] = result;
      evaluateSpy(fieldId, result);
    }

    // B should be evaluated first, then A
    expect(evaluateSpy).toHaveBeenCalledTimes(2);
    expect(evaluateSpy.mock.calls[0]![0]).toBe('B');
    expect(evaluateSpy.mock.calls[0]![1]).toBe(10);
    expect(evaluateSpy.mock.calls[1]![0]).toBe('A');
    expect(evaluateSpy.mock.calls[1]![1]).toBe(11);
  });

  it('results propagate correctly across a chain', () => {
    const graph = new FormulaDependencyGraph();
    graph.addField('C', '5');
    graph.addField('B', 'C * 2');
    graph.addField('A', 'B + 10');

    const dirtyFields = incrementalRecompute(graph, ['C']);

    // Evaluate in order
    const fields: Record<string, Value> = {};
    for (const fieldId of dirtyFields) {
      const evalCtx: EvalContext = { fields, version: 0 };
      // For simplicity, evaluate with fields built up so far
      const formulaMap: Record<string, string> = {
        C: '5',
        B: 'C * 2',
        A: 'B + 10',
      };
      const ast = parseFormula(formulaMap[fieldId]!);
      const result = evaluate(ast, evalCtx);
      fields[fieldId] = result;
    }

    expect(fields['C']).toBe(5);
    expect(fields['B']).toBe(10);
    expect(fields['A']).toBe(20);
  });
});
