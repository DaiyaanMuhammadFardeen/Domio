/**
 * @domio/formula-engine — Spreadsheet-style formula engine.
 */

// Parser
export { parseFormula, parseFormulaField } from './parser.js';

// Evaluator
export { evaluate, type EvalContext, type Value, FUNCTIONS } from './evaluate.js';

// Safe evaluator with sandbox
export { evaluateSafe, SANDBOX_CAPS, assertNoHostAccess, type SandboxCaps } from './sandbox.js';

// Errors
export { FormulaError, FormulaParseError, isFormulaError, type FormulaErrorCode } from './errors.js';

// AST types
export type { FormulaAST, Literal, Reference, Range, Op, Call, Expr } from './ast.js';

// Dependency graph
export { FormulaDependencyGraph, type CycleInfo } from './dag.js';

// Incremental recomputation
export { incrementalRecompute } from './incremental.js';

// Optimization
export { constantFold, commonSubexpressionElimination } from './optimize.js';
