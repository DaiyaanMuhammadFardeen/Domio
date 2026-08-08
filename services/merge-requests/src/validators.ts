/**
 * Validation hooks for merge requests (Phase 18 W2).
 *
 * Injected MergeValidators { lint?, brand?, a11y? } each return
 * { ok, failures[] }. Default noop validators (hooks wired later).
 */

import type { MergeValidators, ValidatorResult, DeckSnapshot, SlideDiff } from './types.js';
import { MergeValidationFailedError } from './types.js';

export const OK_RESULT: ValidatorResult = { ok: true, failures: [] };

/**
 * Run all configured validation hooks against a merge.
 * Returns the first failure or OK.
 */
export async function validateMerge(
  validators: MergeValidators,
  deck: DeckSnapshot,
  diff: SlideDiff,
): Promise<ValidatorResult> {
  const failures: string[] = [];

  if (validators.lint) {
    const result = await validators.lint(deck, diff);
    if (!result.ok) failures.push(...result.failures);
  }

  if (validators.brand) {
    const result = await validators.brand(deck, diff);
    if (!result.ok) failures.push(...result.failures);
  }

  if (validators.a11y) {
    const result = await validators.a11y(deck, diff);
    if (!result.ok) failures.push(...result.failures);
  }

  if (failures.length > 0) {
    throw new MergeValidationFailedError(failures);
  }

  return OK_RESULT;
}
