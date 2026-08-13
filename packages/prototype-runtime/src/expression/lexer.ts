/**
 * Hand-rolled lexer for the prototype expression language.
 *
 * Produces a stream of tokens consumed by `parser.ts`. Stays deliberately
 * small — anything that escapes the whitelist here is rejected either at
 * lex or parse time.
 */

import { CompileError } from './errors.js';

export type TokenKind =
  | 'num'
  | 'str'
  | 'ident'
  | 'var'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'true'
  | 'false'
  | 'null'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly start: number;
}

const TWO_CHAR_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!']);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i]!;

    // Skip whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Numbers
    if (c >= '0' && c <= '9') {
      const start = i;
      while (i < len && ((source[i]! >= '0' && source[i]! <= '9') || source[i] === '.')) {
        i++;
      }
      tokens.push({ kind: 'num', value: source.slice(start, i), start });
      continue;
    }

    // Strings (single or double quotes)
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let value = '';
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < len) {
          const next = source[i + 1]!;
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else if (next === 'r') value += '\r';
          else if (next === '\\') value += '\\';
          else if (next === quote) value += quote;
          else throw new CompileError(`Unknown escape '\\${next}' in string`, i);
          i += 2;
        } else {
          value += source[i];
          i++;
        }
      }
      if (i >= len) throw new CompileError(`Unterminated string literal`, start);
      i++; // closing quote
      tokens.push({ kind: 'str', value, start });
      continue;
    }

    // Variable reference `$name`
    if (c === '$') {
      const start = i;
      i++;
      let name = '';
      while (i < len && isIdentChar(source[i]!)) {
        name += source[i];
        i++;
      }
      if (!name) throw new CompileError(`Expected identifier after '$'`, start);
      tokens.push({ kind: 'var', value: name.toUpperCase(), start });
      continue;
    }

    // Identifiers (function names / true / false / null)
    if (isIdentStart(c)) {
      const start = i;
      let name = '';
      while (i < len && isIdentChar(source[i]!)) {
        name += source[i];
        i++;
      }
      const upper = name.toUpperCase();
      if (upper === 'TRUE') tokens.push({ kind: 'true', value: upper, start });
      else if (upper === 'FALSE') tokens.push({ kind: 'false', value: upper, start });
      else if (upper === 'NULL') tokens.push({ kind: 'null', value: upper, start });
      else tokens.push({ kind: 'ident', value: upper, start });
      continue;
    }

    // Two-character operators first
    if (i + 1 < len) {
      const two = source.slice(i, i + 2);
      if (TWO_CHAR_OPS.has(two)) {
        tokens.push({ kind: 'op', value: two, start: i });
        i += 2;
        continue;
      }
    }

    // Single-character operators / punctuation
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ kind: 'op', value: c, start: i });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', value: c, start: i });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', value: c, start: i });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', value: c, start: i });
      i++;
      continue;
    }

    throw new CompileError(`Unexpected character '${c}'`, i);
  }

  tokens.push({ kind: 'eof', value: '', start: len });
  return tokens;
}

function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}

function isIdentChar(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_';
}
