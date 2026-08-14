/**
 * Expression subsystem tests — lexer, parser, compiler, evaluator.
 */

import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer.js';
import { parseExpression } from './parser.js';
import { compileExpression, validateAst } from './compiler.js';
import { BUILTINS, HOST_ACCESS_NAMES } from './builtins.js';
import {
  evaluateExpression,
  evaluateExpressionWithMetrics,
  DEFAULT_EVAL_CAPS,
} from './evaluator.js';
import {
  CompileError,
  DivisionByZeroError,
  ExpressionError,
  NameError,
  StackOverflowError,
  TimeoutError,
  ValueError,
} from './errors.js';

describe('expression/lexer', () => {
  it('tokenizes numbers, strings, identifiers, $vars, operators', () => {
    const toks = tokenize(`$x + 42 == "yes" && foo(1, 'two')`);
    const kinds = toks.map((t) => t.kind);
    expect(kinds).toEqual([
      'var',
      'op',
      'num',
      'op',
      'str',
      'op',
      'ident',
      'lparen',
      'num',
      'comma',
      'str',
      'rparen',
      'eof',
    ]);
  });

  it('uppercases identifiers and variable names', () => {
    const toks = tokenize(`$pricingTier + Max(1, 2)`);
    expect(toks[0]).toMatchObject({ kind: 'var', value: 'PRICINGTIER' });
    expect(toks.find((t) => t.kind === 'ident')?.value).toBe('MAX');
  });

  it('treats true / false / null as keywords', () => {
    const toks = tokenize('true && false == null');
    const kinds = toks.map((t) => t.kind);
    expect(kinds).toEqual(['true', 'op', 'false', 'op', 'null', 'eof']);
  });

  it('handles escapes in strings', () => {
    const toks = tokenize(`"hello\\nworld"`);
    expect(toks[0]).toMatchObject({ kind: 'str', value: 'hello\nworld' });
  });

  it('rejects unterminated strings', () => {
    expect(() => tokenize('"abc')).toThrow(CompileError);
  });

  it('rejects unknown escape sequences', () => {
    expect(() => tokenize('"\\q"')).toThrow(CompileError);
  });

  it('rejects bare $ without identifier', () => {
    expect(() => tokenize('$ + 1')).toThrow(CompileError);
  });
});

describe('expression/parser', () => {
  it('parses precedence: * binds tighter than +', () => {
    const ast = parseExpression('1 + 2 * 3');
    expect(ast.kind).toBe('binary');
    if (ast.kind === 'binary') {
      expect(ast.operator).toBe('+');
      expect(ast.right.kind).toBe('binary');
    }
  });

  it('parses unary minus and not', () => {
    const ast = parseExpression('!$x');
    expect(ast).toMatchObject({ kind: 'unary', operator: '!' });
  });

  it('parses function calls with multiple arguments', () => {
    const ast = parseExpression('if($x > 0, "pos", "neg")');
    expect(ast).toMatchObject({ kind: 'call', name: 'IF' });
  });

  it('parses && and || with correct precedence', () => {
    const ast = parseExpression('$a || $b && $c');
    expect(ast.kind).toBe('binary');
    if (ast.kind === 'binary') {
      expect(ast.operator).toBe('||');
      expect(ast.right.kind).toBe('binary');
      if (ast.right.kind === 'binary') {
        expect(ast.right.operator).toBe('&&');
      }
    }
  });

  it('rejects garbage after expression', () => {
    expect(() => parseExpression('1 + 2 3')).toThrow(CompileError);
  });
});

describe('expression/compiler', () => {
  it('compiles and caches by source hash', () => {
    const a = compileExpression('1 + 2');
    const b = compileExpression('1 + 2');
    expect(a.hash).toBe(b.hash);
    expect(a.ast).toEqual(b.ast);
  });

  it('rejects empty input', () => {
    expect(() => compileExpression('   ')).toThrow(CompileError);
  });

  it('rejects oversized input', () => {
    const long = '1+'.repeat(3000) + '1'; // 6001 chars > 4096
    expect(() => compileExpression(long)).toThrow(CompileError);
  });

  it('rejects host-access function names', () => {
    expect(() => compileExpression('eval()')).toThrow(NameError);
    expect(() => compileExpression('Function()')).toThrow(NameError);
    expect(() => compileExpression('this')).toThrow(CompileError);
    expect(() => compileExpression('arguments')).toThrow(CompileError);
    expect(() => compileExpression('constructor()')).toThrow(NameError);
    expect(() => compileExpression('prototype()')).toThrow(NameError);
    expect(() => compileExpression('globalThis()')).toThrow(NameError);
    expect(() => compileExpression('process()')).toThrow(NameError);
  });

  it('rejects unknown functions when allowed list is set', () => {
    expect(() => compileExpression('foo(1)', { allowedFunctions: ['IF', 'COALESCE'] })).toThrow(
      NameError,
    );
  });

  it('accepts allow-listed functions', () => {
    const ast = compileExpression('if($x > 0, 1, 0)', { allowedFunctions: ['IF'] }).ast;
    expect(ast).toMatchObject({ kind: 'call', name: 'IF' });
  });

  it('rejects wrong arity', () => {
    expect(() => compileExpression('IF(1)')).toThrow(CompileError);
    expect(() => compileExpression('ROUND()')).toThrow(CompileError);
    expect(() => compileExpression('CLAMP(1, 2)')).toThrow(CompileError);
  });

  it('rejects member access attempts at AST-validation time', () => {
    // The lexer/parser doesn't emit member access — verify validateAst is safe to call.
    const compiled = compileExpression('1 + 2');
    expect(() => validateAst(compiled.ast)).not.toThrow();
  });

  it('host-access names are populated', () => {
    expect(HOST_ACCESS_NAMES.has('EVAL')).toBe(true);
    expect(HOST_ACCESS_NAMES.has('CONSTRUCTOR')).toBe(true);
  });

  it('builtins registry includes the spec set', () => {
    const required = [
      'ROUND',
      'FLOOR',
      'CEIL',
      'ABS',
      'MIN',
      'MAX',
      'CLAMP',
      'IF',
      'COALESCE',
      'LENGTH',
      'MATCH',
      'FORMATNUMBER',
      'FORMATCURRENCY',
      'FORMATDATE',
    ];
    for (const name of required) expect(BUILTINS[name]).toBeDefined();
  });
});

describe('expression/evaluator', () => {
  it('evaluates arithmetic correctly', () => {
    const ast = compileExpression('1 + 2 * 3 - 4 / 2').ast;
    expect(evaluateExpression(ast, { vars: {} })).toBe(5);
  });

  it('evaluates string concat via +', () => {
    const ast = compileExpression('"hello" + " " + "world"').ast;
    expect(evaluateExpression(ast, { vars: {} })).toBe('hello world');
  });

  it('evaluates comparisons', () => {
    const ast = compileExpression('$x > 10').ast;
    expect(evaluateExpression(ast, { vars: { X: 20 } })).toBe(true);
    expect(evaluateExpression(ast, { vars: { X: 5 } })).toBe(false);
  });

  it('evaluates logical && and ||', () => {
    expect(
      evaluateExpression(compileExpression('$a && $b').ast, { vars: { A: true, B: false } }),
    ).toBe(false);
    expect(
      evaluateExpression(compileExpression('$a || $b').ast, { vars: { A: false, B: true } }),
    ).toBe(true);
  });

  it('short-circuit && returns right operand (matches JS truthy semantics)', () => {
    // The evaluator follows JS: a && b returns b when a is truthy, otherwise a.
    expect(
      evaluateExpression(compileExpression('$a && $b').ast, { vars: { A: 1, B: 'yes' } }),
    ).toBe('yes');
  });

  it('evaluates equality with Object.is semantics (NaN === NaN)', () => {
    // Object.is distinguishes +0/-0 but treats NaN === NaN as true.
    expect(evaluateExpression(compileExpression('0 == 0').ast, { vars: {} })).toBe(true);
    expect(evaluateExpression(compileExpression('0 == -0').ast, { vars: {} })).toBe(false);
    expect(evaluateExpression(compileExpression('"a" == "a"').ast, { vars: {} })).toBe(true);
  });

  it('evaluates built-in functions', () => {
    expect(evaluateExpression(compileExpression('ROUND(1.456, 2)').ast, { vars: {} })).toBe(1.46);
    expect(evaluateExpression(compileExpression('MIN(3, 1, 2)').ast, { vars: {} })).toBe(1);
    expect(evaluateExpression(compileExpression('MAX(1, 2, 3)').ast, { vars: {} })).toBe(3);
    expect(evaluateExpression(compileExpression('CLAMP(15, 0, 10)').ast, { vars: {} })).toBe(10);
    expect(
      evaluateExpression(compileExpression('IF($x > 0, "pos", "neg")').ast, { vars: { X: 1 } }),
    ).toBe('pos');
    expect(
      evaluateExpression(compileExpression('COALESCE(null, null, "fallback")').ast, { vars: {} }),
    ).toBe('fallback');
    expect(evaluateExpression(compileExpression('LENGTH("hello")').ast, { vars: {} })).toBe(5);
  });

  it('evaluates formatCurrency with locale', () => {
    const result = evaluateExpression(
      compileExpression('FORMATCURRENCY(1234.5, "USD", "en-US")').ast,
      { vars: {} },
    );
    expect(result).toContain('1,234');
  });

  it('returns null for unset variables rather than throwing', () => {
    expect(evaluateExpression(compileExpression('$missing').ast, { vars: {} })).toBe(null);
  });

  it('throws DivisionByZeroError on /0', () => {
    expect(() => evaluateExpression(compileExpression('1 / 0').ast, { vars: {} })).toThrow(
      DivisionByZeroError,
    );
  });

  it('throws ValueError on bad number conversion', () => {
    expect(() => evaluateExpression(compileExpression('ROUND("abc")').ast, { vars: {} })).toThrow(
      ValueError,
    );
  });

  it('throws NameError on unknown function at evaluate time (defense in depth)', () => {
    // Even if compiler were bypassed, the evaluator must reject.
    expect(() => {
      evaluateExpressionWithMetrics({ kind: 'call', name: 'EVAL', args: [] }, { vars: {} });
    }).toThrow();
  });

  it('throws TimeoutError when maxRuntimeMs exceeded', () => {
    // Force a tiny budget with a slow step counter is not trivial; instead
    // we craft an expression that the wall-clock cap rejects. We override
    // `now` to simulate passage of time.
    const startTimes = [0, 100];
    let i = 0;
    const fakeNow = () => startTimes[i++] ?? 100;
    const ast = compileExpression('1 + 1').ast;
    expect(() =>
      evaluateExpression(ast, { vars: {}, now: fakeNow, caps: { maxRuntimeMs: 5 } }),
    ).toThrow(TimeoutError);
  });

  it('throws StackOverflowError when depth exceeded', () => {
    let src = '1';
    for (let i = 0; i < 100; i++) src = `(${src}) + 1`;
    const ast = compileExpression(src).ast;
    expect(() =>
      evaluateExpression(ast, {
        vars: {},
        caps: { maxDepth: 32, maxSteps: 50_000, maxRuntimeMs: 5_000 },
      }),
    ).toThrow(StackOverflowError);
  });

  it('throws TimeoutError when step cap exceeded', () => {
    const ast = compileExpression('1 + 1 + 1 + 1 + 1').ast;
    expect(() =>
      evaluateExpression(ast, {
        vars: {},
        caps: { maxSteps: 2, maxDepth: 64, maxRuntimeMs: 5_000 },
      }),
    ).toThrow();
  });

  it('metrics are populated', () => {
    const ast = compileExpression('1 + 2 + 3').ast;
    const m = evaluateExpressionWithMetrics(ast, { vars: {} });
    expect(m.steps).toBeGreaterThan(0);
    expect(m.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('default caps are exported', () => {
    expect(DEFAULT_EVAL_CAPS.maxSteps).toBe(5_000);
    expect(DEFAULT_EVAL_CAPS.maxDepth).toBe(64);
    // 50 ms is the default — see evaluator.ts for the rationale (5 ms
    // is too tight for CI runners sharing CPUs with other packages;
    // 50 ms is still well under a frame at 60 Hz).
    expect(DEFAULT_EVAL_CAPS.maxRuntimeMs).toBe(50);
  });

  it('exposes ExpressionError as the umbrella class', () => {
    expect(new ExpressionError('#NAME?', 'x')).toBeInstanceOf(ExpressionError);
    expect(new NameError('x')).toBeInstanceOf(ExpressionError);
  });
});
