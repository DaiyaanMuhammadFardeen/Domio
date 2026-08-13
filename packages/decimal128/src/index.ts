/**
 * @domio/decimal128 — Phase 10 M4.2.
 * 38-digit-precision decimal arithmetic for the calculator runtime.
 */

export {
  DEC128_PRECISION,
  OVERFLOW_MAX,
  toString,
  isNaN,
  isInfinity,
  isFinite,
  isZero,
  compare,
  add,
  sub,
  mul,
  div,
  type DecInput,
  type DecResult,
} from './arithmetic.js';

export { round, type RoundingMode } from './rounding.js';
export { parseDecimal } from './parse.js';
export {
  formatNumber,
  formatCurrency,
  type SupportedLocale,
  type FormatOptions,
} from './format.js';
