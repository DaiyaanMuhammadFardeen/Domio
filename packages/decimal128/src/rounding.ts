/**
 * Rounding helpers re-exported for direct consumption.
 */
import { round as roundImpl, type DecInput, type DecResult, type RoundingMode } from './arithmetic.js';
export { type RoundingMode, type DecResult };

export function round(value: DecInput, scale: number, mode: RoundingMode = 'bankers'): DecResult {
  return roundImpl(value, scale, mode);
}
