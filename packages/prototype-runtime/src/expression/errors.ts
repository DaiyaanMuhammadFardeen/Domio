/**
 * Expression compile + eval errors.
 *
 * Errors are tagged with a code that the UI / MCP layer can surface in a
 * red squiggle or `application/problem+json` body. Codes mirror the
 * `@domio/formula-engine` codes where they overlap so authors see a
 * familiar vocabulary.
 */

export type ExpressionErrorCode =
  | '#SYNTAX!'
  | '#NAME?'
  | '#TYPE!'
  | '#VALUE!'
  | '#DIV/0!'
  | '#REF!'
  | '#CYCLE!'
  | '#N/A'
  | '#RANGE!'
  | '#TIMEOUT!'
  | '#STACK!'
  | '#UNKNOWN!';

export class ExpressionError extends Error {
  readonly code: ExpressionErrorCode;
  readonly position?: number;

  constructor(code: ExpressionErrorCode, message: string, position?: number) {
    super(message);
    this.name = 'ExpressionError';
    this.code = code;
    if (position !== undefined) this.position = position;
  }
}

export class CompileError extends ExpressionError {
  constructor(message: string, position?: number) {
    super('#SYNTAX!', message, position);
    this.name = 'CompileError';
  }
}

export class NameError extends ExpressionError {
  constructor(message: string) {
    super('#NAME?', message);
    this.name = 'NameError';
  }
}

export class TypeErrorX extends ExpressionError {
  constructor(message: string) {
    super('#TYPE!', message);
    this.name = 'TypeError';
  }
}

export class ValueError extends ExpressionError {
  constructor(message: string) {
    super('#VALUE!', message);
    this.name = 'ValueError';
  }
}

export class DivisionByZeroError extends ExpressionError {
  constructor() {
    super('#DIV/0!', 'Division by zero');
    this.name = 'DivisionByZeroError';
  }
}

export class TimeoutError extends ExpressionError {
  constructor() {
    super('#TIMEOUT!', 'Expression evaluation exceeded the per-frame budget');
    this.name = 'TimeoutError';
  }
}

export class StackOverflowError extends ExpressionError {
  constructor() {
    super('#STACK!', 'Expression exceeded the recursion cap');
    this.name = 'StackOverflowError';
  }
}

export function isExpressionError(v: unknown): v is ExpressionError {
  return v instanceof ExpressionError;
}