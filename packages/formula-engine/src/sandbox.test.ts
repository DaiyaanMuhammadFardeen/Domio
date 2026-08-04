/**
 * Tests for sandbox evaluation with caps.
 */

import { describe, it, expect } from 'vitest';
import { parseFormula } from './parser.js';
import type { EvalContext } from './evaluate.js';
import { evaluateSafe, assertNoHostAccess } from './sandbox.js';
import { FormulaError, type FormulaErrorCode } from './errors.js';

const baseCtx: EvalContext = { fields: {}, version: 0 };

/** Assert a FormulaError with a specific code. */
function expectError(fn: () => void, code: FormulaErrorCode): void {
  try {
    fn();
    expect.fail(`Expected ${code} but no error was thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaError);
    expect((e as FormulaError).code).toBe(code);
  }
}

describe('assertNoHostAccess', () => {
  it('rejects reference to eval (parser uppercases to EVAL)', () => {
    const ast = parseFormula('eval');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to Function (parser uppercases to FUNCTION)', () => {
    const ast = parseFormula('Function');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to globalThis', () => {
    const ast = parseFormula('globalThis');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to process', () => {
    const ast = parseFormula('process');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to require', () => {
    const ast = parseFormula('require');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to fetch', () => {
    const ast = parseFormula('fetch');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to window', () => {
    const ast = parseFormula('window');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to document', () => {
    const ast = parseFormula('document');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to global', () => {
    const ast = parseFormula('global');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to module', () => {
    const ast = parseFormula('module');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to XMLHttpRequest', () => {
    const ast = parseFormula('XMLHttpRequest');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects reference to import', () => {
    const ast = parseFormula('import');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects function call to eval', () => {
    // eval("alert(1)") parses as call EVAL("alert(1)")
    const ast = parseFormula('eval(1)');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects function call to Function', () => {
    // Function(1) parses as call FUNCTION(1)
    const ast = parseFormula('Function(1)');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('rejects host access in nested expression', () => {
    const ast = parseFormula('1 + process');
    expectError(() => assertNoHostAccess(ast), '#NAME?');
  });

  it('allows safe named ranges', () => {
    const ast = parseFormula('myField + revenue');
    expect(() => assertNoHostAccess(ast)).not.toThrow();
  });

  it('allows built-in functions', () => {
    const ast = parseFormula('SUM(1, 2, 3)');
    expect(() => assertNoHostAccess(ast)).not.toThrow();
  });

  it('allows literal values', () => {
    const ast = parseFormula('42');
    expect(() => assertNoHostAccess(ast)).not.toThrow();
  });

  it('allows boolean literals', () => {
    const ast = parseFormula('TRUE');
    expect(() => assertNoHostAccess(ast)).not.toThrow();
  });
});

describe('evaluateSafe', () => {
  it('evaluates a benign formula', () => {
    const ast = parseFormula('1 + 2');
    const result = evaluateSafe(ast, baseCtx);
    expect(result).toBe(3);
  });

  it('evaluates a formula with field references (parser uppercases)', () => {
    const ast = parseFormula('revenue');
    // Parser uppercases to REVENUE, so field must be stored uppercase
    const result = evaluateSafe(ast, { fields: { REVENUE: 100 }, version: 0 });
    expect(result).toBe(100);
  });

  it('rejects eval access in formula', () => {
    // eval("1") parses as call EVAL("1")
    const ast = parseFormula('eval(1)');
    expectError(() => evaluateSafe(ast, baseCtx), '#NAME?');
  });

  it('rejects process as reference', () => {
    const ast = parseFormula('process');
    expectError(() => evaluateSafe(ast, baseCtx), '#NAME?');
  });

  it('rejects fetch as function call', () => {
    const ast = parseFormula('fetch(1)');
    expectError(() => evaluateSafe(ast, baseCtx), '#NAME?');
  });

  it('throws #NUM! when steps exceed cap', () => {
    const ast = parseFormula('1 + 2');
    expectError(() => evaluateSafe(ast, baseCtx, { maxSteps: 0 }), '#NUM!');
  });

  it('throws #NUM! when recursion depth cap is exceeded', () => {
    // maxRecursion=-1 means depth 0 > -1 triggers the check
    const ast = parseFormula('1');
    expectError(() => evaluateSafe(ast, baseCtx, { maxRecursion: -1 }), '#NUM!');
  });

  it('throws #NUM! when runtime cap is exceeded', () => {
    // maxRuntimeMs=-1 means Date.now()-startTime (>=0) > -1 is true
    const ast = parseFormula('1');
    expectError(() => evaluateSafe(ast, baseCtx, { maxRuntimeMs: -1 }), '#NUM!');
  });

  it('caps are configurable and generous caps succeed', () => {
    const ast = parseFormula('SUM(1, 2, 3)');
    const result = evaluateSafe(ast, baseCtx, {
      maxSteps: 100_000,
      maxRecursion: 128,
      maxStringLength: 1_000_000,
      maxRuntimeMs: 5000,
    });
    expect(result).toBe(6);
  });

  it('rejects named range that shadows host access', () => {
    const ast = parseFormula('eval');
    expectError(() => evaluateSafe(ast, baseCtx), '#NAME?');
  });
});
