/**
 * Recursive-descent parser for formula expressions.
 */

import type { Expr, FormulaAST } from './ast.js';
import { FormulaParseError } from './errors.js';
import { tokenize, type Token, type TokenKind } from './lexer.js';

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]!;
    this.pos++;
    return tok;
  }

  private expect(kind: TokenKind): Token {
    const tok = this.peek();
    if (tok.kind !== kind) {
      throw new FormulaParseError(
        `Expected ${kind}, got ${tok.kind} ('${tok.value}') at position ${tok.start}`
      );
    }
    return this.advance();
  }

  parse(): FormulaAST {
    const expr = this.parseComparison();
    if (this.peek().kind !== 'eof') {
      throw new FormulaParseError(
        `Unexpected token '${this.peek().value}' at position ${this.peek().start}`
      );
    }
    return expr;
  }

  // comparisons: = <> <= >= < >
  private parseComparison(): Expr {
    let left = this.parseConcat();
    const tok = this.peek();
    if (tok.kind === 'op' && (tok.value === '=' || tok.value === '<>' || tok.value === '<=' || tok.value === '>=' || tok.value === '<' || tok.value === '>')) {
      const op = this.advance().value;
      const right = this.parseConcat();
      left = { kind: 'op', operator: op, left, right };
    }
    return left;
  }

  // concatenation: &
  private parseConcat(): Expr {
    let left = this.parseAddSub();
    while (this.peek().kind === 'op' && this.peek().value === '&') {
      this.advance();
      const right = this.parseAddSub();
      left = { kind: 'op', operator: '&', left, right };
    }
    return left;
  }

  // addition/subtraction: + -
  private parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.peek().kind === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value;
      const right = this.parseMulDiv();
      left = { kind: 'op', operator: op, left, right };
    }
    return left;
  }

  // multiplication/division/modulo: * / %
  private parseMulDiv(): Expr {
    let left = this.parsePower();
    while (
      this.peek().kind === 'op' &&
      (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')
    ) {
      const op = this.advance().value;
      const right = this.parsePower();
      left = { kind: 'op', operator: op, left, right };
    }
    return left;
  }

  // power: ^ (right-associative)
  private parsePower(): Expr {
    let base = this.parseUnary();
    if (this.peek().kind === 'op' && this.peek().value === '^') {
      this.advance();
      const exp = this.parseUnary();
      base = { kind: 'op', operator: '^', left: base, right: exp };
    }
    return base;
  }

  // unary: - +
  private parseUnary(): Expr {
    if (this.peek().kind === 'op' && (this.peek().value === '-' || this.peek().value === '+')) {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { kind: 'op', operator: op, left: operand };
    }
    return this.parsePostfix();
  }

  // postfix / primary
  private parsePostfix(): Expr {
    const tok = this.peek();

    // parenthesized expression
    if (tok.kind === 'lparen') {
      this.advance();
      const expr = this.parseComparison();
      this.expect('rparen');
      return expr;
    }

    // number
    if (tok.kind === 'number') {
      this.advance();
      return { kind: 'literal', value: parseFloat(tok.value) };
    }

    // string
    if (tok.kind === 'string') {
      this.advance();
      return { kind: 'literal', value: tok.value };
    }

    // boolean
    if (tok.kind === 'boolean') {
      this.advance();
      return { kind: 'literal', value: tok.value === 'TRUE' };
    }

    // cell reference or function call or named reference
    if (tok.kind === 'cellref') {
      this.advance();
      // Check for range: A1:B2
      if (this.peek().kind === 'colon') {
        this.advance();
        const endTok = this.expect('cellref');
        return { kind: 'range', start: tok.value, end: endTok.value };
      }
      return { kind: 'reference', name: tok.value };
    }

    // identifier — could be a function call or named range
    if (tok.kind === 'identifier') {
      this.advance();
      // function call: NAME(args)
      if (this.peek().kind === 'lparen') {
        this.advance();
        const args: Expr[] = [];
        if (this.peek().kind !== 'rparen') {
          args.push(this.parseComparison());
          while (this.peek().kind === 'comma') {
            this.advance();
            args.push(this.parseComparison());
          }
        }
        this.expect('rparen');
        return { kind: 'call', name: tok.value, args };
      }
      // Named reference
      return { kind: 'reference', name: tok.value };
    }

    throw new FormulaParseError(
      `Unexpected token '${tok.value || tok.kind}' at position ${tok.start}`
    );
  }
}

/**
 * Parse a formula expression string into an AST.
 */
export function parseFormula(expr: string): FormulaAST {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * Parse and validate a formula field definition.
 * Field name must match ^[a-z][a-z0-9_]*$
 */
export function parseFormulaField(
  name: string,
  expression: string
): { name: string; ast: FormulaAST } {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new FormulaParseError(
      `Invalid field name '${name}'. Must match ^[a-z][a-z0-9_]*$`
    );
  }
  const ast = parseFormula(expression);
  return { name, ast };
}
