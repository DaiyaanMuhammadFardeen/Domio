/**
 * Expression subsystem — public surface.
 */

export type { Expression, LiteralNode, VariableRef, BinaryOp, UnaryOp, FuncCall } from './ast.js';
export { BUILTINS, HOST_ACCESS_NAMES } from './builtins.js';
export {
  compileExpression,
  validateAst,
  type CompileOptions,
  type CompiledExpression,
} from './compiler.js';
export {
  evaluateExpression,
  evaluateExpressionWithMetrics,
  DEFAULT_EVAL_CAPS,
  type EvalContext,
  type EvalResult,
  type EvalCaps,
} from './evaluator.js';
export {
  ExpressionError,
  CompileError,
  NameError,
  TypeErrorX,
  ValueError,
  DivisionByZeroError,
  TimeoutError,
  StackOverflowError,
  isExpressionError,
  type ExpressionErrorCode,
} from './errors.js';
export { parseExpression } from './parser.js';
export { tokenize } from './lexer.js';