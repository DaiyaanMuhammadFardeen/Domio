/**
 * AST node types for the prototype runtime's expression language.
 *
 * The compiler whitelists exactly these shapes; anything else is rejected
 * at compile time. This is the first line of defense against sandbox
 * escape — see `compiler.ts` and `evaluator.ts`.
 *
 * Design notes:
 *   - No cell ranges (`A1:B2`) — runtime context is a flat var map.
 *   - Identifiers are uppercase-normalized; references must start with `$`
 *     (matches the variable naming convention used in authoring UI).
 *   - Member access is NOT allowed — that closes off prototype-chain
 *     attacks.
 */

export type LiteralValue = number | string | boolean | null;

export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: LiteralValue;
}

/** `$name` — a reference to a variable in the runtime context. */
export interface VariableRef {
  readonly kind: 'variable';
  readonly name: string;
}

export interface BinaryOp {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||';

export interface UnaryOp {
  readonly kind: 'unary';
  readonly operator: '!' | '-';
  readonly operand: Expression;
}

export interface FuncCall {
  readonly kind: 'call';
  /** Function name — must be in the builtin registry. */
  readonly name: string;
  readonly args: readonly Expression[];
}

export type Expression = LiteralNode | VariableRef | BinaryOp | UnaryOp | FuncCall;
