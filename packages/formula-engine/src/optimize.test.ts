/**
 * Tests for formula AST optimization passes.
 */

import { describe, it, expect } from 'vitest';
import { constantFold, commonSubexpressionElimination } from './optimize.js';
import { parseFormula } from './parser.js';
import { evaluate, type EvalContext } from './evaluate.js';

const ctx: EvalContext = { fields: {}, version: 0 };

describe('constantFold', () => {
  it('folds simple addition', () => {
    const ast = parseFormula('1 + 2');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 3 });
  });

  it('folds 1+2*3 to literal 7', () => {
    const ast = parseFormula('1 + 2 * 3');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 7 });
  });

  it('folds subtraction', () => {
    const ast = parseFormula('10 - 3');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 7 });
  });

  it('folds multiplication', () => {
    const ast = parseFormula('4 * 5');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 20 });
  });

  it('folds division', () => {
    const ast = parseFormula('10 / 2');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 5 });
  });

  it('does not fold division by zero', () => {
    const ast = parseFormula('10 / 0');
    const folded = constantFold(ast);
    // Should remain an op node, not fold
    expect(folded.kind).toBe('op');
  });

  it('folds power', () => {
    const ast = parseFormula('2 ^ 10');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 1024 });
  });

  it('folds nested expressions', () => {
    const ast = parseFormula('(1 + 2) * (3 + 4)');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 21 });
  });

  it('folds comparison operators', () => {
    expect(constantFold(parseFormula('1 < 2'))).toEqual({ kind: 'literal', value: true });
    expect(constantFold(parseFormula('1 > 2'))).toEqual({ kind: 'literal', value: false });
    expect(constantFold(parseFormula('1 = 1'))).toEqual({ kind: 'literal', value: true });
    expect(constantFold(parseFormula('1 <> 2'))).toEqual({ kind: 'literal', value: true });
    expect(constantFold(parseFormula('1 <= 1'))).toEqual({ kind: 'literal', value: true });
    expect(constantFold(parseFormula('1 >= 2'))).toEqual({ kind: 'literal', value: false });
  });

  it('folds string concatenation', () => {
    const ast = parseFormula('"hello" & " " & "world"');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 'hello world' });
  });

  it('does not fold expressions with references', () => {
    const ast = parseFormula('A1 + 1');
    const folded = constantFold(ast);
    expect(folded.kind).toBe('op');
  });

  it('folds pure function calls with literal args', () => {
    const ast = parseFormula('ABS(-5)');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 5 });
  });

  it('folds nested pure function calls', () => {
    const ast = parseFormula('ABS(ROUND(1.6, 0))');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 2 });
  });

  it('does not fold function calls with references', () => {
    const ast = parseFormula('ABS(A1)');
    const folded = constantFold(ast);
    expect(folded.kind).toBe('call');
  });

  it('preserves evaluation correctness after folding', () => {
    const ast = parseFormula('1 + 2 * 3 - 4 / 2');
    const folded = constantFold(ast);
    const result = evaluate(folded, ctx);
    expect(result).toBe(5); // 1 + 6 - 2 = 5
  });

  it('folds unary negation', () => {
    const ast = parseFormula('-5');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: -5 });
  });

  it('folds modulo', () => {
    const ast = parseFormula('10 % 3');
    const folded = constantFold(ast);
    expect(folded).toEqual({ kind: 'literal', value: 1 });
  });

  it('does not fold modulo by zero', () => {
    const ast = parseFormula('10 % 0');
    const folded = constantFold(ast);
    expect(folded.kind).toBe('op');
  });
});

describe('commonSubexpressionElimination', () => {
  it('detects duplicate subexpressions', () => {
    const ast = parseFormula('A1 + A1');
    const { ast: optimized, saved } = commonSubexpressionElimination(ast);
    expect(saved).toBeGreaterThan(0);
    // The optimized AST should have a shared node
    expect(optimized.kind).toBe('op');
  });

  it('returns 0 saved for unique expressions', () => {
    const ast = parseFormula('A1 + B1');
    const { saved } = commonSubexpressionElimination(ast);
    expect(saved).toBe(0);
  });

  it('deduplicates same function call', () => {
    const ast = parseFormula('ABS(A1) + ABS(A1)');
    const { saved } = commonSubexpressionElimination(ast);
    expect(saved).toBeGreaterThan(0);
  });

  it('does not affect evaluation result', () => {
    const ast = parseFormula('(1 + 2) + (1 + 2)');
    const { ast: optimized } = commonSubexpressionElimination(ast);

    const origResult = evaluate(ast, ctx);
    const optResult = evaluate(optimized, ctx);
    expect(origResult).toBe(optResult);
    expect(origResult).toBe(6);
  });

  it('handles complex nested expressions', () => {
    const ast = parseFormula('SUM(A1, B1) + SUM(A1, B1) + C1');
    const { saved } = commonSubexpressionElimination(ast);
    expect(saved).toBeGreaterThan(0);
  });

  it('does not save for single-occurrence subtrees', () => {
    const ast = parseFormula('SUM(1, 2) + PRODUCT(3, 4)');
    const { saved } = commonSubexpressionElimination(ast);
    expect(saved).toBe(0);
  });
});
