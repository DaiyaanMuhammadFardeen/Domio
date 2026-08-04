/**
 * Tokenizer for formula expressions.
 */

import { FormulaParseError } from './errors.js';

export type TokenKind =
  | 'number'
  | 'string'
  | 'identifier'
  | 'cellref'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'
  | 'boolean'
  | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

function isAlpha(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isAlnum(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos]!;

    // whitespace
    if (ch === ' ' || ch === '\t') {
      pos++;
      continue;
    }

    // string literal
    if (ch === '"') {
      const start = pos;
      pos++; // skip opening quote
      let value = '';
      while (pos < input.length) {
        const c = input[pos]!;
        if (c === '"') {
          if (pos + 1 < input.length && input[pos + 1] === '"') {
            value += '"';
            pos += 2;
          } else {
            pos++; // skip closing quote
            break;
          }
        } else {
          value += c;
          pos++;
        }
      }
      tokens.push({ kind: 'string', value, start, end: pos });
      continue;
    }

    // number (including leading dot)
    if (isDigit(ch) || (ch === '.' && pos + 1 < input.length && isDigit(input[pos + 1]!))) {
      const start = pos;
      while (pos < input.length && (isDigit(input[pos]!) || input[pos] === '.')) {
        pos++;
      }
      tokens.push({ kind: 'number', value: input.slice(start, pos), start, end: pos });
      continue;
    }

    // identifiers / cell refs / booleans
    if (isAlpha(ch) || ch === '$') {
      const start = pos;
      // collect leading $ signs (for absolute refs like $A$1)
      let raw = '';
      while (pos < input.length && input[pos] === '$') {
        raw += input[pos];
        pos++;
      }
      // collect alpha part
      let alpha = '';
      while (pos < input.length && isAlpha(input[pos]!)) {
        alpha += input[pos]!.toUpperCase();
        pos++;
      }
      // collect digit part (for cell refs)
      let digits = '';
      while (pos < input.length && isDigit(input[pos]!)) {
        digits += input[pos]!;
        pos++;
      }
      // collect rest of identifier (alphanumeric + underscore)
      let rest = '';
      while (pos < input.length && (isAlnum(input[pos]!) || input[pos] === '_')) {
        rest += input[pos]!.toUpperCase();
        pos++;
      }

      const full = (raw + alpha + digits + rest).replace(/\$/g, '');

      // Check if it looks like a cell ref: alpha part is 1-3 letters followed by digits
      if (alpha.length >= 1 && alpha.length <= 3 && digits.length >= 1 && rest === '') {
        tokens.push({ kind: 'cellref', value: full, start, end: pos });
        continue;
      }

      // Check for TRUE/FALSE
      if (full === 'TRUE' || full === 'FALSE') {
        tokens.push({ kind: 'boolean', value: full, start, end: pos });
        continue;
      }

      // General identifier (function name or named reference)
      tokens.push({ kind: 'identifier', value: full, start, end: pos });
      continue;
    }

    // operators
    if ('+-*/^%&=<>'.includes(ch)) {
      const start = pos;
      pos++;
      if (pos < input.length) {
        const next = input[pos]!;
        if ((ch === '<' && (next === '=' || next === '>')) || (ch === '>' && next === '=')) {
          pos++;
        }
      }
      tokens.push({ kind: 'op', value: input.slice(start, pos), start, end: pos });
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: '(', start: pos, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')', start: pos, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', value: ',', start: pos, end: pos + 1 });
      pos++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon', value: ':', start: pos, end: pos + 1 });
      pos++;
      continue;
    }

    throw new FormulaParseError(`Unexpected character '${ch}' at position ${pos}`);
  }

  tokens.push({ kind: 'eof', value: '', start: pos, end: pos });
  return tokens;
}
