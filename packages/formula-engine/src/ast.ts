/**
 * AST node types for the formula engine.
 */

export interface Literal {
  kind: 'literal';
  value: number | string | boolean | null;
}

export interface Reference {
  kind: 'reference';
  /** Cell ref or named range, normalized to uppercase. $A$1 → A1 */
  name: string;
}

export interface Range {
  kind: 'range';
  /** Start cell (e.g. "A1"), normalized to uppercase */
  start: string;
  /** End cell (e.g. "B2"), normalized to uppercase */
  end: string;
}

export interface Op {
  kind: 'op';
  operator: string;
  left?: Expr;
  right?: Expr;
}

export interface Call {
  kind: 'call';
  name: string;
  args: Expr[];
}

export type FormulaAST = Literal | Reference | Range | Op | Call;

export type Expr = FormulaAST;
