/**
 * Structured operation validation (Phase 18 #182).
 *
 * Pure functions for validating CRDT operations in suggestions.
 * Content type only allowed with structured params — never raw text.
 */

import type { SuggestionOperation, OpType } from '../types.js';
import { SuggestionValidationError } from '../types.js';

const VALID_OP_TYPES: ReadonlySet<string> = new Set<OpType>([
  'move',
  'resize',
  'restyle',
  'content',
  'data_binding',
  'theme',
]);

/**
 * Validate a suggestion operation.
 * - Rejects unknown types.
 * - Content type only allowed with structured params (paragraphs/blocks), never bare text string.
 */
export function validateOp(op: SuggestionOperation): void {
  if (!op || typeof op !== 'object') {
    throw new SuggestionValidationError('operation must be a non-null object');
  }
  if (typeof op.type !== 'string') {
    throw new SuggestionValidationError('operation.type is required and must be a string');
  }
  if (!VALID_OP_TYPES.has(op.type)) {
    throw new SuggestionValidationError(`Unknown operation type: ${op.type}`);
  }
  if (!op.params || typeof op.params !== 'object') {
    throw new SuggestionValidationError('operation.params must be a non-null object');
  }
  if (!op.before_state || typeof op.before_state !== 'object') {
    throw new SuggestionValidationError('operation.before_state must be a non-null object');
  }
  if (!op.after_state || typeof op.after_state !== 'object') {
    throw new SuggestionValidationError('operation.after_state must be a non-null object');
  }

  // Content type: reject raw-text ops (params.text being a string = raw text)
  if (op.type === 'content') {
    const params = op.params;
    if (typeof params.text === 'string') {
      throw new SuggestionValidationError(
        'content operations must use structured params (paragraphs/blocks), not raw text',
      );
    }
    // Also reject if params has only a bare `value` string with no structured content
    if (typeof params.value === 'string' && !params.paragraphs && !params.blocks) {
      throw new SuggestionValidationError(
        'content operations must use structured params (paragraphs/blocks), not raw text',
      );
    }
  }
}
