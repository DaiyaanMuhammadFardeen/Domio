/**
 * Formula engine error types.
 */

export type FormulaErrorCode =
  | '#DIV/0!'
  | '#REF!'
  | '#CYCLE!'
  | '#NAME?'
  | '#VALUE!'
  | '#N/A'
  | '#NUM!'
  | '#NULL!'
  | '#ERROR!';

export class FormulaError extends Error {
  readonly code: FormulaErrorCode;

  constructor(code: FormulaErrorCode, message: string) {
    super(message);
    this.name = 'FormulaError';
    this.code = code;
  }
}

export class FormulaParseError extends FormulaError {
  constructor(message: string) {
    super('#ERROR!', message);
    this.name = 'FormulaParseError';
  }
}

export function isFormulaError(v: unknown): v is FormulaError {
  return v instanceof FormulaError;
}
