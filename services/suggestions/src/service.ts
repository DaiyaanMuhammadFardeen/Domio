/**
 * Suggestions service (Phase 18 #182).
 *
 * Transport-agnostic orchestration of suggestion mode.
 * Depends on:
 *  - {@link SuggestionsStore}      — persistence.
 *  - {@link SuggestionEventEmitter} — event emission (default: noopEmitter).
 */

import type {
  Suggestion,
  SuggestionOperation,
  SuggestionStatus,
  BrandLockProvider,
} from './types.js';
import { SuggestionNotFoundError, BrandLockError } from './types.js';
import { validateOp } from './suggestion/ops.js';
import {
  createSuggestionBody,
  acceptSuggestionBody,
  rejectSuggestionBody,
  markObsoleteBody,
  applyOp,
  filterExpired,
  sweepOpenSuggestions,
  findConflictingObsoleteIds,
} from './suggestion/lifecycle.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type { SuggestionEventEmitter } from './types.js';
import { noopEmitter, defaultBrandLockProvider } from './types.js';
import type { SuggestionsStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface SuggestionsServiceOptions {
  readonly store: SuggestionsStore;
  readonly eventEmitter?: SuggestionEventEmitter;
  readonly brandLockProvider?: BrandLockProvider;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SuggestionsService {
  private readonly store: SuggestionsStore;
  private readonly emitter: SuggestionEventEmitter;
  private readonly brandLockProvider: BrandLockProvider;
  private readonly clock: () => Date;

  constructor(opts: SuggestionsServiceOptions) {
    if (!opts.store) throw new Error('SuggestionsService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.brandLockProvider = opts.brandLockProvider ?? defaultBrandLockProvider;
    this.clock = opts.now ?? (() => new Date());
  }

  private idGen(): string {
    return crypto.randomUUID();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Create suggestion
  // -------------------------------------------------------------------------

  async createSuggestion(
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
    actorId: string,
  ): Promise<Suggestion> {
    checkFeature(FEATURE_FLAGS.suggestions);

    // Validate the operation structure
    validateOp(input.operation);

    const suggestion = createSuggestionBody(input, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    await this.store.insertSuggestion(suggestion);

    await this.emitter.publish('suggestion.created', {
      event_id: this.idGen(),
      event_type: 'suggestion.created',
      ts_ms: this.now().getTime(),
      workspace_id: suggestion.workspace_id,
      deck_id: suggestion.deck_id,
      actor_id: actorId,
      actor_type: 'member',
      payload: {
        suggestion_id: suggestion.id,
        deck_id: suggestion.deck_id,
        author_id: suggestion.author_id,
        target_type: suggestion.target_type,
        target_id: suggestion.target_id,
        operation: suggestion.operation,
      },
    });

    return suggestion;
  }

  // -------------------------------------------------------------------------
  // Get suggestion
  // -------------------------------------------------------------------------

  async getSuggestion(suggestionId: string): Promise<Suggestion> {
    checkFeature(FEATURE_FLAGS.suggestions);
    const suggestion = await this.store.getSuggestion(suggestionId);
    if (!suggestion) throw new SuggestionNotFoundError(suggestionId);
    return suggestion;
  }

  // -------------------------------------------------------------------------
  // List suggestions
  // -------------------------------------------------------------------------

  async listSuggestions(
    deckId: string,
    opts?: { status?: SuggestionStatus },
  ): Promise<Suggestion[]> {
    checkFeature(FEATURE_FLAGS.suggestions);
    const nowMs = this.now().getTime();
    const all = await this.store.listSuggestionsByDeck(deckId, opts?.status);

    // Filter out expired open suggestions
    return filterExpired(all, nowMs);
  }

  // -------------------------------------------------------------------------
  // Accept suggestion
  // -------------------------------------------------------------------------

  async acceptSuggestion(
    suggestionId: string,
    acceptedBy: string,
    breakBrandLock: boolean,
  ): Promise<Suggestion> {
    checkFeature(FEATURE_FLAGS.suggestions);
    const suggestion = await this.store.getSuggestion(suggestionId);
    if (!suggestion) throw new SuggestionNotFoundError(suggestionId);

    // Brand-lock check (author creating is always ok; accept needs override)
    if (!breakBrandLock) {
      const isLocked = this.brandLockProvider.isBrandLocked(
        suggestion.target_id,
        suggestion.operation,
      );
      if (isLocked) {
        throw new BrandLockError(suggestion.target_id);
      }
    }

    // Accept
    const update = acceptSuggestionBody(suggestion, acceptedBy, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    const accepted = await this.store.updateSuggestion(suggestionId, {
      status: update.status,
      resolved_at: update.resolved_at,
      resolved_by: update.resolved_by,
      updated_at: update.updated_at,
      updated_by: update.updated_by,
    });

    // Emit suggestion.accepted
    await this.emitter.publish('suggestion.accepted', {
      event_id: this.idGen(),
      event_type: 'suggestion.accepted',
      ts_ms: this.now().getTime(),
      workspace_id: accepted.workspace_id,
      deck_id: accepted.deck_id,
      actor_id: acceptedBy,
      actor_type: 'member',
      payload: {
        suggestion_id: accepted.id,
        deck_id: accepted.deck_id,
        accepted_by: acceptedBy,
      },
    });

    // Mark semantically-conflicting suggestions obsolete
    const allSuggestions = await this.store.listSuggestionsByDeck(accepted.deck_id);
    const obsoleteIds = findConflictingObsoleteIds(accepted.operation, allSuggestions);

    for (const obsoleteId of obsoleteIds) {
      const obsolete = await this.store.getSuggestion(obsoleteId);
      if (!obsolete || obsolete.status !== 'open') continue;

      const obsoleteUpdate = markObsoleteBody(obsolete, {
        now: () => this.now(),
        idGen: () => this.idGen(),
      });

      await this.store.updateSuggestion(obsoleteId, {
        status: obsoleteUpdate.status,
        updated_at: obsoleteUpdate.updated_at,
      });

      await this.emitter.publish('suggestion.obsolete', {
        event_id: this.idGen(),
        event_type: 'suggestion.obsolete',
        ts_ms: this.now().getTime(),
        workspace_id: obsolete.workspace_id,
        deck_id: obsolete.deck_id,
        actor_id: 'system',
        actor_type: 'system',
        payload: {
          suggestion_id: obsoleteId,
          deck_id: obsolete.deck_id,
          reason: 'conflict_with_accepted',
        },
      });
    }

    return accepted;
  }

  // -------------------------------------------------------------------------
  // Reject suggestion
  // -------------------------------------------------------------------------

  async rejectSuggestion(
    suggestionId: string,
    rejectedBy: string,
    reason?: string,
  ): Promise<Suggestion> {
    checkFeature(FEATURE_FLAGS.suggestions);
    const suggestion = await this.store.getSuggestion(suggestionId);
    if (!suggestion) throw new SuggestionNotFoundError(suggestionId);

    const update = rejectSuggestionBody(suggestion, rejectedBy, reason, {
      now: () => this.now(),
      idGen: () => this.idGen(),
    });

    const rejected = await this.store.updateSuggestion(suggestionId, {
      status: update.status,
      resolved_at: update.resolved_at,
      resolved_by: update.resolved_by,
      updated_at: update.updated_at,
      updated_by: update.updated_by,
    });

    await this.emitter.publish('suggestion.rejected', {
      event_id: this.idGen(),
      event_type: 'suggestion.rejected',
      ts_ms: this.now().getTime(),
      workspace_id: rejected.workspace_id,
      deck_id: rejected.deck_id,
      actor_id: rejectedBy,
      actor_type: 'member',
      payload: {
        suggestion_id: rejected.id,
        deck_id: rejected.deck_id,
        rejected_by: rejectedBy,
        reason: reason ?? '',
      },
    });

    return rejected;
  }

  // -------------------------------------------------------------------------
  // Sweep expired
  // -------------------------------------------------------------------------

  async sweepOpenSuggestions(): Promise<number> {
    checkFeature(FEATURE_FLAGS.suggestions);
    const nowMs = this.now().getTime();
    const openSuggestions = await this.store.listOpenSuggestions();
    const expired = sweepOpenSuggestions(openSuggestions, nowMs);

    for (const suggestion of expired) {
      const update = markObsoleteBody(suggestion, {
        now: () => this.now(),
        idGen: () => this.idGen(),
      });

      await this.store.updateSuggestion(suggestion.id, {
        status: update.status,
        updated_at: update.updated_at,
      });

      await this.emitter.publish('suggestion.obsolete', {
        event_id: this.idGen(),
        event_type: 'suggestion.obsolete',
        ts_ms: this.now().getTime(),
        workspace_id: suggestion.workspace_id,
        deck_id: suggestion.deck_id,
        actor_id: 'system',
        actor_type: 'system',
        payload: {
          suggestion_id: suggestion.id,
          deck_id: suggestion.deck_id,
          reason: 'expired',
        },
      });
    }

    return expired.length;
  }

  // -------------------------------------------------------------------------
  // Pure helpers exposed for testing
  // -------------------------------------------------------------------------

  applyOpToDeck(
    deck: { elements: Record<string, Record<string, unknown>> },
    op: SuggestionOperation,
  ) {
    return applyOp(deck, op);
  }
}
