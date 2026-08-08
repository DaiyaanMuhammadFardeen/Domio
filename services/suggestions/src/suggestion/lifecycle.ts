/**
 * Suggestion lifecycle — create/accept/reject/obsolete/expiry (Phase 18 #182).
 *
 * Pure logic functions for suggestion state management.
 * Expired open suggestions (90 days) are treated as obsolete.
 */

import type { Suggestion, SuggestionStatus, SuggestionOperation } from '../types.js';
import { SuggestionValidationError, InvalidStatusTransitionError } from '../types.js';
import { markConflictingObsolete } from './conflict.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default suggestion retention: 90 days. */
export const SUGGESTION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// DomainOpts (injectable clock + id)
// ---------------------------------------------------------------------------

export interface DomainOpts {
  readonly now: () => Date;
  readonly idGen: () => string;
}

// ---------------------------------------------------------------------------
// createSuggestionBody
// ---------------------------------------------------------------------------

export function createSuggestionBody(
  input: {
    workspace_id: string;
    deck_id: string;
    session_id: string;
    author_id: string;
    target_type: string;
    target_id: string;
    operation: SuggestionOperation;
    thread_id?: string;
  },
  opts: DomainOpts,
): Suggestion {
  if (!input.workspace_id) throw new SuggestionValidationError('workspace_id is required');
  if (!input.deck_id) throw new SuggestionValidationError('deck_id is required');
  if (!input.session_id) throw new SuggestionValidationError('session_id is required');
  if (!input.author_id) throw new SuggestionValidationError('author_id is required');
  if (!input.target_id) throw new SuggestionValidationError('target_id is required');

  const validTargetTypes = new Set(['element', 'slide', 'data_binding']);
  if (!validTargetTypes.has(input.target_type)) {
    throw new SuggestionValidationError(`Invalid target_type: ${input.target_type}`);
  }

  const now = opts.now();
  const base: Omit<Suggestion, 'thread_id'> = {
    id: opts.idGen(),
    workspace_id: input.workspace_id,
    deck_id: input.deck_id,
    session_id: input.session_id,
    author_id: input.author_id,
    target_type: input.target_type as import('../types.js').TargetType,
    target_id: input.target_id,
    operation: input.operation,
    status: 'open',
    created_at: now,
    updated_at: now,
    created_by: input.author_id,
    updated_by: input.author_id,
  };

  if (input.thread_id != null) {
    return { ...base, thread_id: input.thread_id };
  }
  return base;
}

// ---------------------------------------------------------------------------
// acceptSuggestionBody
// ---------------------------------------------------------------------------

export function acceptSuggestionBody(
  suggestion: Suggestion,
  acceptedBy: string,
  opts: DomainOpts,
): { status: SuggestionStatus; resolved_at: Date; resolved_by: string; updated_at: Date; updated_by: string } {
  if (suggestion.status !== 'open') {
    throw new InvalidStatusTransitionError(suggestion.status, 'accepted');
  }
  const now = opts.now();
  return {
    status: 'accepted',
    resolved_at: now,
    resolved_by: acceptedBy,
    updated_at: now,
    updated_by: acceptedBy,
  };
}

// ---------------------------------------------------------------------------
// rejectSuggestionBody
// ---------------------------------------------------------------------------

export function rejectSuggestionBody(
  suggestion: Suggestion,
  rejectedBy: string,
  _reason: string | undefined,
  opts: DomainOpts,
): { status: SuggestionStatus; resolved_at: Date; resolved_by: string; updated_at: Date; updated_by: string } {
  if (suggestion.status !== 'open') {
    throw new InvalidStatusTransitionError(suggestion.status, 'rejected');
  }
  const now = opts.now();
  return {
    status: 'rejected',
    resolved_at: now,
    resolved_by: rejectedBy,
    updated_at: now,
    updated_by: rejectedBy,
  };
}

// ---------------------------------------------------------------------------
// markObsoleteBody
// ---------------------------------------------------------------------------

export function markObsoleteBody(
  suggestion: Suggestion,
  opts: DomainOpts,
): { status: SuggestionStatus; updated_at: Date } {
  if (suggestion.status === 'accepted' || suggestion.status === 'rejected') {
    throw new InvalidStatusTransitionError(suggestion.status, 'obsolete');
  }
  return {
    status: 'obsolete',
    updated_at: opts.now(),
  };
}

// ---------------------------------------------------------------------------
// applyOp — pure transformer on a deck state snapshot
// ---------------------------------------------------------------------------

export interface DeckState {
  readonly elements: Record<string, Record<string, unknown>>;
}

/**
 * Apply a suggestion operation to a deck state snapshot.
 * Returns a new DeckState with the operation applied (immutable transform).
 */
export function applyOp(deck: DeckState, op: SuggestionOperation): DeckState {
  const elements = { ...deck.elements };
  const targetId = (op.params.target_id as string) ?? '';
  if (!targetId || !elements[targetId]) return deck;

  const element = { ...elements[targetId] };
  const afterState = op.after_state;
  for (const [key, value] of Object.entries(afterState)) {
    element[key] = value;
  }
  elements[targetId] = element;
  return { elements };
}

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

/**
 * Check if an open suggestion has expired (created_at + 90 days < now).
 */
export function isExpired(suggestion: Suggestion, nowMs: number): boolean {
  if (suggestion.status !== 'open') return false;
  return nowMs - suggestion.created_at.getTime() >= SUGGESTION_RETENTION_MS;
}

/**
 * Filter out expired suggestions from a list (for listSuggestions).
 */
export function filterExpired(suggestions: readonly Suggestion[], nowMs: number): Suggestion[] {
  return suggestions.filter((s) => !isExpired(s, nowMs));
}

/**
 * Sweep open suggestions and return those that should be marked obsolete.
 */
export function sweepOpenSuggestions(
  suggestions: readonly Suggestion[],
  nowMs: number,
): Suggestion[] {
  return suggestions.filter((s) => isExpired(s, nowMs));
}

/**
 * After accepting a suggestion, find other open suggestions that conflict
 * and should be marked obsolete.
 */
export function findConflictingObsoleteIds(
  acceptedOp: SuggestionOperation,
  otherSuggestions: readonly Suggestion[],
): string[] {
  const openOthers = otherSuggestions
    .filter((s) => s.status === 'open')
    .map((s) => ({ id: s.id, operation: s.operation }));
  return markConflictingObsolete(acceptedOp, openOthers);
}
