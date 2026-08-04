/**
 * Prototype-recorder service — persistence layer (Phase 10 M5).
 *
 * Repository interfaces + in-memory implementations for:
 *   - prototype_sessions  — one per test-runner session
 *   - prototype_events    — append-only ledger tied to a session
 *   - integrity_chain     — append-only HMAC key ledger per (tenant, deck, kid)
 *
 * All repositories are tenant-scoped (keyed by `tenantId::id`).
 *
 * The wire shape reuses the runtime types verbatim; the runtime is
 * in-process and the service is the persisted CRUD layer that the
 * editor, viewer, and (future) MCP surface target.
 */

import type {
  PrototypeSession,
  PrototypeEvent,
  IntegrityKey,
  ConsentTier,
  Region,
} from './types.js';

// ── Repository interfaces ──────────────────────────────────────────────

export interface PrototypeSessionRepository {
  insert(record: PrototypeSession): Promise<void>;
  findById(id: string, tenantId: string): Promise<PrototypeSession | null>;
  /** List sessions for a deck. Optional `subjectId` filters to DSR requests. */
  listByDeck(deckId: string, tenantId: string, opts?: { subjectId?: string; region?: Region }): Promise<PrototypeSession[]>;
  /** List every session for a subject across decks (DSR list endpoint). */
  listBySubject(subjectId: string, tenantId: string): Promise<PrototypeSession[]>;
  /** List every session for a tenant across decks (retention cron path). */
  listByTenant(tenantId: string): Promise<PrototypeSession[]>;
  delete(id: string, tenantId: string): Promise<void>;
  /** Hard-delete all sessions whose `expiresAt` is in the past. */
  deleteExpired(now: number): Promise<{ deletedSessions: number; deletedEvents: number }>;
}

export interface PrototypeEventRepository {
  insert(record: PrototypeEvent): Promise<void>;
  /** Return events in monotonic seq order. */
  listBySession(sessionId: string, tenantId: string): Promise<PrototypeEvent[]>;
  /** Return events for an entire deck (used by replay). */
  listByDeck(deckId: string, tenantId: string): Promise<PrototypeEvent[]>;
  /** Delete all events attached to a session (caller has already deleted the session). */
  deleteBySession(sessionId: string, tenantId: string): Promise<number>;
  /** Bulk delete events for sessions older than a cutoff. */
  deleteOlderThan(cutoff: number): Promise<number>;
}

export interface IntegrityChainRepository {
  insert(record: IntegrityKey): Promise<void>;
  /** Return keys in `rotated_at` ascending order — earliest active key first. */
  listForTenantDeck(tenantId: string, deckId: string): Promise<IntegrityKey[]>;
  /** Find the active primary key for a (tenant, deck). */
  findActive(tenantId: string, deckId: string, now: number): Promise<IntegrityKey | null>;
  /** Mark every prior key whose `overlap_until` has passed as supersedable. */
  pruneExpired(now: number): Promise<number>;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class HmacVerificationError extends Error {
  readonly code = 'HMAC_VERIFICATION_FAILED' as const;
  constructor(public readonly reason: string) {
    super(`HMAC verification failed: ${reason}`);
    this.name = 'HmacVerificationError';
  }
}

export class ReorderDetectedError extends Error {
  readonly code = 'CHAIN_REORDER_DETECTED' as const;
  constructor(public readonly sessionId: string, public readonly expectedSeq: number, public readonly actualSeq: number) {
    super(`Chain reorder detected for session ${sessionId}: expected seq ${expectedSeq}, got ${actualSeq}`);
    this.name = 'ReorderDetectedError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(public readonly reason: string) {
    super(`Validation failed: ${reason}`);
    this.name = 'ValidationError';
  }
}

export class RegionMismatchError extends Error {
  readonly code = 'REGION_PIN_MISMATCH' as const;
  constructor(public readonly expected: Region, public readonly got: string) {
    super(`Region pin mismatch: expected ${expected}, got ${got}`);
    this.name = 'RegionMismatchError';
  }
}

export class HmacKeyGenerationError extends Error {
  readonly code = 'HMAC_KEY_ERROR' as const;
  constructor(public readonly reason: string) {
    super(`HMAC key error: ${reason}`);
    this.name = 'HmacKeyGenerationError';
  }
}

// ── In-memory implementations ──────────────────────────────────────────

abstract class InMemoryRepo<R extends { readonly id: string; readonly tenantId: string }> {
  protected store = new Map<string, R>();
  protected k(r: R): string { return `${r.tenantId}::${r.id}`; }
}

export class InMemoryPrototypeSessionRepository extends InMemoryRepo<PrototypeSession> implements PrototypeSessionRepository {
  async insert(record: PrototypeSession): Promise<void> { this.store.set(this.k(record), record); }

  async findById(id: string, tenantId: string): Promise<PrototypeSession | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string, opts?: { subjectId?: string; region?: Region }): Promise<PrototypeSession[]> {
    const out: PrototypeSession[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId !== tenantId) continue;
      if (r.deckId !== deckId) continue;
      if (opts?.subjectId && r.subjectId !== opts.subjectId) continue;
      if (opts?.region && r.region !== opts.region) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async listBySubject(subjectId: string, tenantId: string): Promise<PrototypeSession[]> {
    const out: PrototypeSession[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId !== tenantId) continue;
      if (r.subjectId !== subjectId) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async listByTenant(tenantId: string): Promise<PrototypeSession[]> {
    const out: PrototypeSession[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId !== tenantId) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }

  async deleteExpired(now: number): Promise<{ deletedSessions: number; deletedEvents: number }> {
    let deletedSessions = 0;
    const toRemove: string[] = [];
    for (const r of this.store.values()) {
      if (r.expiresAt <= now) {
        toRemove.push(this.k(r));
        deletedSessions += 1;
      }
    }
    for (const k of toRemove) this.store.delete(k);
    return { deletedSessions, deletedEvents: 0 };
  }
}

export class InMemoryPrototypeEventRepository implements PrototypeEventRepository {
  private events: PrototypeEvent[] = [];

  async insert(record: PrototypeEvent): Promise<void> { this.events.push(record); }

  async listBySession(sessionId: string, tenantId: string): Promise<PrototypeEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq);
  }

  async listByDeck(deckId: string, tenantId: string): Promise<PrototypeEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.deckId === deckId)
      .sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
        return a.seq - b.seq;
      });
  }

  async deleteBySession(sessionId: string, tenantId: string): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter((e) => !(e.tenantId === tenantId && e.sessionId === sessionId));
    return before - this.events.length;
  }

  async deleteOlderThan(cutoff: number): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.createdAt >= cutoff);
    return before - this.events.length;
  }
}

export class InMemoryIntegrityChainRepository implements IntegrityChainRepository {
  private store: IntegrityKey[] = [];

  async insert(record: IntegrityKey): Promise<void> { this.store.push(record); }

  async listForTenantDeck(tenantId: string, deckId: string): Promise<IntegrityKey[]> {
    return this.store
      .filter((k) => k.tenantId === tenantId && k.deckId === deckId)
      .sort((a, b) => a.rotatedAt - b.rotatedAt);
  }

  async findActive(tenantId: string, deckId: string, now: number): Promise<IntegrityKey | null> {
    const keys = await this.listForTenantDeck(tenantId, deckId);
    // Prefer keys whose `overlap_until` is in the future (still actively accepted).
    const stillActive = keys.filter((k) => k.overlapUntil > now);
    if (stillActive.length === 0) {
      // Fall back to the most recent non-expired key.
      return keys.filter((k) => k.expiresAt > now).slice(-1)[0] ?? null;
    }
    // The newest key (largest rotatedAt) is the primary.
    return stillActive.slice(-1)[0] ?? null;
  }

  async pruneExpired(now: number): Promise<number> { return 0; void now; }
}

// ── Tier / region re-exports ───────────────────────────────────────────

export type { ConsentTier, Region };
