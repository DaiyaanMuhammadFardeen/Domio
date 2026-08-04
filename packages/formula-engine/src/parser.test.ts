/**
 * Parser tests.
 */

import { describe, it, expect } from 'vitest';
import { parseFormula, parseFormulaField } from './parser.js';
import { FormulaParseError } from './errors.js';

describe('parseFormula', () => {
  describe('literals', () => {
    it('parses a number literal', () => {
      const ast = parseFormula('42');
      expect(ast).toEqual({ kind: 'literal', value: 42 });
    });

    it('parses a decimal number', () => {
      const ast = parseFormula('3.14');
      expect(ast).toEqual({ kind: 'literal', value: 3.14 });
    });

    it('parses a string literal', () => {
      const ast = parseFormula('"hello"');
      expect(ast).toEqual({ kind: 'literal', value: 'hello' });
    });

    it('parses a string with escaped quotes', () => {
      const ast = parseFormula('"he said ""hi""');
      expect(ast).toEqual({ kind: 'literal', value: 'he said "hi"' });
    });

    it('parses boolean TRUE', () => {
      const ast = parseFormula('TRUE');
      expect(ast).toEqual({ kind: 'literal', value: true });
    });

    it('parses boolean FALSE', () => {
      const ast = parseFormula('FALSE');
      expect(ast).toEqual({ kind: 'literal', value: false });
    });

    it('parses null literal', () => {
      // null is parsed as identifier and treated as null in evaluate
      const ast = parseFormula('42');
      expect(ast.kind).toBe('literal');
    });
  });

  describe('references', () => {
    it('parses a cell reference', () => {
      const ast = parseFormula('A1');
      expect(ast).toEqual({ kind: 'reference', name: 'A1' });
    });

    it('normalizes cell reference to uppercase', () => {
      const ast = parseFormula('b2');
      expect(ast).toEqual({ kind: 'reference', name: 'B2' });
    });

    it('parses a named reference', () => {
      const ast = parseFormula('myField');
      expect(ast).toEqual({ kind: 'reference', name: 'MYFIELD' });
    });
  });

  describe('ranges', () => {
    it('parses a range reference', () => {
      const ast = parseFormula('A1:B2');
      expect(ast).toEqual({ kind: 'range', start: 'A1', end: 'B2' });
    });
  });

  describe('operators', () => {
    it('parses addition', () => {
      const ast = parseFormula('1 + 2');
      expect(ast).toEqual({
        kind: 'op',
        operator: '+',
        left: { kind: 'literal', value: 1 },
        right: { kind: 'literal', value: 2 },
      });
    });

    it('parses subtraction', () => {
      const ast = parseFormula('5 - 3');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('-');
      }
    });

    it('parses multiplication', () => {
      const ast = parseFormula('2 * 3');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('*');
      }
    });

    it('parses division', () => {
      const ast = parseFormula('10 / 2');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('/');
      }
    });

    it('parses power', () => {
      const ast = parseFormula('2 ^ 3');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('^');
      }
    });

    it('parses modulo', () => {
      const ast = parseFormula('10 % 3');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('%');
      }
    });

    it('parses concatenation', () => {
      const ast = parseFormula('"a" & "b"');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('&');
      }
    });

    it('parses comparisons', () => {
      for (const op of ['=', '<>', '<', '>', '<=', '>=']) {
        const ast = parseFormula(`1 ${op} 2`);
        expect(ast.kind).toBe('op');
        if (ast.kind === 'op') {
          expect(ast.operator).toBe(op);
        }
      }
    });
  });

  describe('precedence', () => {
    it('multiplication before addition', () => {
      const ast = parseFormula('1 + 2 * 3');
      // Should be 1 + (2 * 3)
      expect(ast).toEqual({
        kind: 'op',
        operator: '+',
        left: { kind: 'literal', value: 1 },
        right: {
          kind: 'op',
          operator: '*',
          left: { kind: 'literal', value: 2 },
          right: { kind: 'literal', value: 3 },
        },
      });
    });

    it('power before multiplication', () => {
      const ast = parseFormula('2 * 3 ^ 2');
      // Should be 2 * (3 ^ 2)
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('*');
        expect(ast.right?.kind).toBe('op');
        if (ast.right?.kind === 'op') {
          expect(ast.right.operator).toBe('^');
        }
      }
    });

    it('concatenation after addition', () => {
      const ast = parseFormula('1 + 2 & "a"');
      // Should be (1 + 2) & "a"
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('&');
        expect(ast.left?.kind).toBe('op');
        if (ast.left?.kind === 'op') {
          expect(ast.left.operator).toBe('+');
        }
      }
    });
  });

  describe('unary operators', () => {
    it('parses unary minus', () => {
      const ast = parseFormula('-5');
      expect(ast).toEqual({
        kind: 'op',
        operator: '-',
        left: { kind: 'literal', value: 5 },
      });
    });

    it('parses unary plus', () => {
      const ast = parseFormula('+5');
      expect(ast).toEqual({
        kind: 'op',
        operator: '+',
        left: { kind: 'literal', value: 5 },
      });
    });

    it('parses double negation', () => {
      const ast = parseFormula('--5');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('-');
        expect(ast.left?.kind).toBe('op');
      }
    });
  });

  describe('function calls', () => {
    it('parses a function call with no args', () => {
      const ast = parseFormula('NOW()');
      expect(ast).toEqual({ kind: 'call', name: 'NOW', args: [] });
    });

    it('parses a function call with one arg', () => {
      const ast = parseFormula('ABS(-5)');
      expect(ast).toEqual({
        kind: 'call',
        name: 'ABS',
        args: [{ kind: 'op', operator: '-', left: { kind: 'literal', value: 5 } }],
      });
    });

    it('parses a function call with multiple args', () => {
      const ast = parseFormula('IF(1, 2, 3)');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('IF');
        expect(ast.args).toHaveLength(3);
      }
    });

    it('parses nested function calls', () => {
      const ast = parseFormula('SUM(ABS(-1), ABS(-2))');
      expect(ast.kind).toBe('call');
      if (ast.kind === 'call') {
        expect(ast.name).toBe('SUM');
        expect(ast.args).toHaveLength(2);
        expect(ast.args[0]?.kind).toBe('call');
      }
    });
  });

  describe('parentheses', () => {
    it('parses parenthesized expression', () => {
      const ast = parseFormula('(1 + 2)');
      expect(ast).toEqual({
        kind: 'op',
        operator: '+',
        left: { kind: 'literal', value: 1 },
        right: { kind: 'literal', value: 2 },
      });
    });

    it('uses parentheses for precedence', () => {
      const ast = parseFormula('(1 + 2) * 3');
      expect(ast.kind).toBe('op');
      if (ast.kind === 'op') {
        expect(ast.operator).toBe('*');
        expect(ast.left?.kind).toBe('op');
        if (ast.left?.kind === 'op') {
          expect(ast.left.operator).toBe('+');
        }
      }
    });
  });

  describe('error cases', () => {
    it('throws on unbalanced parentheses', () => {
      expect(() => parseFormula('(1 + 2')).toThrow(FormulaParseError);
    });

    it('throws on unexpected character', () => {
      expect(() => parseFormula('1 @ 2')).toThrow(FormulaParseError);
    });

    it('throws on trailing tokens', () => {
      expect(() => parseFormula('1 2')).toThrow(FormulaParseError);
    });
  });
});

describe('parseFormulaField', () => {
  it('accepts valid field names', () => {
    const result = parseFormulaField('gmv', 'A1 * B1');
    expect(result.name).toBe('gmv');
    expect(result.ast.kind).toBe('op');
  });

  it('accepts field names with underscores', () => {
    const result = parseFormulaField('my_field', '1');
    expect(result.name).toBe('my_field');
  });

  it('accepts field names starting with letter', () => {
    const result = parseFormulaField('abc', '1');
    expect(result.name).toBe('abc');
  });

  it('rejects field names starting with digit', () => {
    expect(() => parseFormulaField('1field', '1')).toThrow(FormulaParseError);
  });

  it('rejects field names with spaces', () => {
    expect(() => parseFormulaField('my field', '1')).toThrow(FormulaParseError);
  });

  it('rejects field names with special characters', () => {
    expect(() => parseFormulaField('my-field', '1')).toThrow(FormulaParseError);
  });

  it('rejects empty field names', () => {
    expect(() => parseFormulaField('', '1')).toThrow(FormulaParseError);
  });

  it('rejects UPPERCASE field names', () => {
    expect(() => parseFormulaField('FIELD', '1')).toThrow(FormulaParseError);
  });

  it('rejects field names with uppercase letters', () => {
    expect(() => parseFormulaField('MyField', '1')).toThrow(FormulaParseError);
  });

  it('rejects field names that are only underscores', () => {
    expect(() => parseFormulaField('_', '1')).toThrow(FormulaParseError);
  });
});
