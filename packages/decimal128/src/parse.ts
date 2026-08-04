/**
 * Parse helpers.
 */
import { toString, type DecInput } from './arithmetic.js';

export function parseDecimal(value: DecInput): string {
  return toString(value);
}
