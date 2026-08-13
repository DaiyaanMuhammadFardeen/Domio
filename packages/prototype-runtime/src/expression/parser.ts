/**
 * Recursive-descent parser for prototype expressions.
 *
 * Precedence (low → high):
 *   1. logical or  ||
 *   2. logical and &&
 *   3. equality    == !=
 *   4. relational  < <= > >=
 *   5. additive    + -
 *   6. multiplicative * / %
 *   7. unary       ! -
 *   8. primary     literal | $var | ident(args) | (expr)
 *
 * Anything that doesn't fit (member access, indexing, dynamic property
 * access, `eval`, `Function`, `this`) is rejected — see the lexer, which
 * refuses `.[` and `[`.
 */

import type { Expression } from './ast.js';
import { CompileError } from './errors.js';
import type { Token } from './lexer.js';
import { tokenize } from './lexer.js';

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!;
    this.pos++;
    return t;
  }

  private expect(kind: Token['kind']): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new CompileError(`Expected ${kind}, got ${t.kind} ('${t.value}')`, t.start);
    }
    return this.advance();
  }

  parse(): Expression {
    const expr = this.parseOr();
    if (this.peek().kind !== 'eof') {
      throw new CompileError(`Unexpected token '${this.peek().value}'`, this.peek().start);
    }
    return expr;
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (this.peek().kind === 'op' && this.peek().value === '||') {
      this.advance();
      const right = this.parseAnd();
      left = { kind: 'binary', operator: '||', left, right };
    }
    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();
    while (this.peek().kind === 'op' && this.peek().value === '&&') {
      this.advance();
      const right = this.parseEquality();
      left = { kind: 'binary', operator: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseRelational();
    while (
      this.peek().kind === 'op' &&
      (this.peek().value === '==' || this.peek().value === '!=')
    ) {
      const op = this.advance().value as '==' | '!=';
      const right = this.parseRelational();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseRelational(): Expression {
    let left = this.parseAdditive();
    while (
      this.peek().kind === 'op' &&
      (this.peek().value === '<' ||
        this.peek().value === '<=' ||
        this.peek().value === '>' ||
        this.peek().value === '>=')
    ) {
      const t = this.advance();
      const op = t.value as '<' | '<=' | '>' | '>=';
      const right = this.parseAdditive();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    while (this.peek().kind === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMultiplicative();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();
    while (
      this.peek().kind === 'op' &&
      (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')
    ) {
      const op = this.advance().value as '*' | '/' | '%';
      const right = this.parseUnary();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.peek().kind === 'op' && (this.peek().value === '!' || this.peek().value === '-')) {
      const op = this.advance().value as '!' | '-';
      const operand = this.parseUnary();
      return { kind: 'unary', operator: op, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const t = this.peek();

    if (t.kind === 'num') {
      this.advance();
      const n = Number(t.value);
      if (Number.isNaN(n)) throw new CompileError(`Invalid number '${t.value}'`, t.start);
      return { kind: 'literal', value: n };
    }

    if (t.kind === 'str') {
      this.advance();
      return { kind: 'literal', value: t.value };
    }

    if (t.kind === 'true') {
      this.advance();
      return { kind: 'literal', value: true };
    }

    if (t.kind === 'false') {
      this.advance();
      return { kind: 'literal', value: false };
    }

    if (t.kind === 'null') {
      this.advance();
      return { kind: 'literal', value: null };
    }

    if (t.kind === 'var') {
      this.advance();
      return { kind: 'variable', name: t.value };
    }

    if (t.kind === 'lparen') {
      this.advance();
      const expr = this.parseOr();
      this.expect('rparen');
      return expr;
    }

    if (t.kind === 'ident') {
      this.advance();
      // function call
      this.expect('lparen');
      const args: Expression[] = [];
      if (this.peek().kind !== 'rparen') {
        args.push(this.parseOr());
        while (this.peek().kind === 'comma') {
          this.advance();
          args.push(this.parseOr());
        }
      }
      this.expect('rparen');
      return { kind: 'call', name: t.value, args };
    }

    throw new CompileError(`Unexpected token '${t.value}'`, t.start);
  }
}

export function parseExpression(source: string): Expression {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}
