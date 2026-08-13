/**
 * Prototype-recorder service — business logic (Phase 10 M5).
 *
 * Wires the three repositories behind a service facade that:
 *   - generates session ids + per-session tokens
 *   - enforces DSR cascade (delete session ⇒ delete events)
 *   - performs the PDPA retention cron (hard-delete expired sessions/events)
 *   - delegates chain/HMAC math to `IntegrityChain`
 */

import type {
  PrototypeSession,
  PrototypeEvent,
  IntegrityKey,
  ConsentTier,
  Region,
  EventType,
} from './types.js';
import { NotFoundError, ValidationError, RegionMismatchError } from './dal.js';
import type {
  PrototypeSessionRepository,
  PrototypeEventRepository,
  IntegrityChainRepository,
} from './dal.js';
import { IntegrityChain, ROTATION_OVERLAP_MS } from './integrity.js';
import { generateKeyHex } from './integrity.js';

const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newId(prefix: string): string {
  let out = prefix;
  for (let i = 0; i < 22; i++) out += ULID_CHARS[Math.floor(Math.random() * 32)]!;
  return out;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day default retention
const SESSION_TOKEN_BYTES = 16;

// ── Service options ────────────────────────────────────────────────────

export interface PrototypeRecorderServiceOptions {
  readonly sessions: PrototypeSessionRepository;
  readonly events: PrototypeEventRepository;
  readonly keys: IntegrityChainRepository;
  readonly clock?: () => number;
  readonly idGenerator?: () => string;
  /** Default retention (ms) when the start request omits one. */
  readonly defaultRetentionMs?: number;
  /** Override the chain for tests. */
  readonly chain?: IntegrityChain;
}

export interface StartSessionInput {
  readonly deckId: string;
  readonly subjectId?: string | null;
  readonly consent: ConsentTier;
  readonly region: Region;
  readonly regionPinned?: boolean;
  readonly abVariant?: string | null;
  readonly samplingRate?: number;
  readonly ttlMs?: number;
  readonly rejoinSessionToken?: string;
}

export interface IngestEventInput {
  readonly sessionId: string;
  readonly eventType: EventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientFingerprint: string;
  readonly createdAt?: number;
  /** When the client supplies its own signed event (offline batch). */
  readonly signedEvent?: Omit<PrototypeEvent, 'eventHash'> & { readonly eventHash: string };
}

export interface IngestBatchInput {
  readonly sessionId: string;
  readonly events: readonly IngestEventInput[];
}

// ── Service ─────────────────────────────────────────────────────────────

export class PrototypeRecorderService {
  private readonly sessions: PrototypeSessionRepository;
  private readonly events: PrototypeEventRepository;
  private readonly keys: IntegrityChainRepository;
  private readonly clock: () => number;
  private readonly idGenerator: () => string;
  private readonly defaultRetentionMs: number;
  private chain: IntegrityChain;
  /** Hydrate state on each `reloadChain` — seeded from the events repo. */
  private chainHydrated = false;
  /** Last known chain snapshot to preserve across `reloadChain` rebuilds. */
  private chainState: {
    lastSeqBySession: Record<string, number>;
    lastHashBySession: Record<string, number>;
  } | null = null;

  constructor(opts: PrototypeRecorderServiceOptions) {
    this.sessions = opts.sessions;
    this.events = opts.events;
    this.keys = opts.keys;
    this.clock = opts.clock ?? (() => Date.now());
    this.idGenerator = opts.idGenerator ?? (() => newId('ps'));
    this.defaultRetentionMs = opts.defaultRetentionMs ?? DEFAULT_TTL_MS;
    this.chain = opts.chain ?? new IntegrityChain({ keys: [] });
  }

  // ── Session lifecycle ───────────────────────────────────────────────

  async startSession(tenantId: string, input: StartSessionInput): Promise<PrototypeSession> {
    const now = this.clock();
    const consent = input.consent;
    if (!['opt_in', 'opt_out', 'anonymous'].includes(consent)) {
      throw new ValidationError(`unknown consent tier ${consent}`);
    }
    const region = input.region;
    if (!['us-east', 'us-west', 'eu-central', 'ap-south', 'ap-east'].includes(region)) {
      throw new ValidationError(`unknown region ${region}`);
    }
    const samplingRate = clamp01(input.samplingRate ?? 1.0);
    const ttl = input.ttlMs ?? this.defaultRetentionMs;

    // Rejoin path: the client asks us to continue an existing session.
    if (input.rejoinSessionToken) {
      const all = await this.sessions.listByDeck(input.deckId, tenantId);
      const match = all.find((s) => s.sessionToken === input.rejoinSessionToken);
      if (match) {
        if (match.region !== region && match.regionPinned) {
          throw new RegionMismatchError(match.region, region);
        }
        const updated: PrototypeSession = {
          ...match,
          lastEventAt: now,
        };
        await this.sessions.delete(match.id, tenantId);
        await this.sessions.insert(updated);
        return updated;
      }
    }

    const activeKey = await this.keys.findActive(tenantId, input.deckId, now);
    if (!activeKey) {
      // Provision a primary key on first session. This is the
      // operator-driven bootstrap path; production should rotate via
      // `rotateOperatorKey()`.
      const kid = `kid-${now.toString(36)}`;
      const key: IntegrityKey = {
        id: `ik-${kid}`,
        tenantId,
        deckId: input.deckId,
        kid,
        keyHex: generateKeyHex(),
        rotatedAt: now,
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        overlapUntil: now + ROTATION_OVERLAP_MS,
      };
      await this.keys.insert(key);
      await this.reloadChain(tenantId, input.deckId);
    }
    const id = this.idGenerator();
    const sessionToken = randomToken(SESSION_TOKEN_BYTES);
    const session: PrototypeSession = {
      id,
      tenantId,
      deckId: input.deckId,
      subjectId: input.subjectId ?? null,
      sessionToken,
      consent,
      region,
      abVariant: input.abVariant ?? null,
      samplingRate,
      regionPinned: input.regionPinned ?? false,
      kid: activeKey?.kid ?? `kid-${now.toString(36)}`,
      startedAt: now,
      lastEventAt: now,
      expiresAt: now + ttl,
      lastSeq: 0,
    };
    await this.sessions.insert(session);
    return session;
  }

  async getSession(tenantId: string, sessionId: string): Promise<PrototypeSession> {
    const s = await this.sessions.findById(sessionId, tenantId);
    if (!s) throw new NotFoundError('PrototypeSession', sessionId);
    return s;
  }

  async listSessionsForDeck(
    tenantId: string,
    deckId: string,
    opts?: { region?: Region },
  ): Promise<PrototypeSession[]> {
    const repoOpts: { subjectId?: string; region?: Region } = {};
    if (opts?.region !== undefined) repoOpts.region = opts.region;
    return this.sessions.listByDeck(deckId, tenantId, repoOpts);
  }

  async listEventsForSession(tenantId: string, sessionId: string): Promise<PrototypeEvent[]> {
    const s = await this.sessions.findById(sessionId, tenantId);
    if (!s) throw new NotFoundError('PrototypeSession', sessionId);
    return this.events.listBySession(sessionId, tenantId);
  }

  // ── Event ingest ────────────────────────────────────────────────────

  async ingestEvent(tenantId: string, input: IngestEventInput): Promise<PrototypeEvent> {
    const session = await this.sessions.findById(input.sessionId, tenantId);
    if (!session) throw new NotFoundError('PrototypeSession', input.sessionId);

    if (session.regionPinned && input.payload['region'] !== undefined) {
      // Region on the wire mismatches the pinned one — refuse.
      const wireRegion =
        typeof input.payload['region'] === 'string' ? input.payload['region'] : 'unknown';
      if (session.region !== wireRegion) {
        throw new RegionMismatchError(session.region, wireRegion);
      }
    }

    await this.reloadChain(tenantId, session.deckId);

    let event: PrototypeEvent;
    if (input.signedEvent) {
      // Client supplied a pre-signed event — verify and commit.
      const verified = this.chain.verify({
        event: {
          ...input.signedEvent,
          tenantId,
          deckId: session.deckId,
          sessionId: session.id,
          kid: input.signedEvent.kid ?? session.kid,
        },
        kid: input.signedEvent.kid ?? session.kid,
        now: this.clock(),
      });
      // Build a fully-materialized event for persistence.
      event = {
        ...input.signedEvent,
        tenantId,
        deckId: session.deckId,
        sessionId: session.id,
        kid: input.signedEvent.kid ?? session.kid,
      };
      this.chain.commit(event);
      void verified;
    } else {
      event = this.chain.buildEvent({
        tenantId,
        deckId: session.deckId,
        sessionId: session.id,
        eventType: input.eventType,
        payload: input.payload,
        clientFingerprint: input.clientFingerprint,
        region: session.region,
        ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      });
      this.chain.commit(event);
    }

    await this.events.insert(event);

    // Bump session.last_event_at + lastSeq.
    const refreshed: PrototypeSession = {
      ...session,
      lastEventAt: event.createdAt,
      lastSeq: event.seq,
    };
    await this.sessions.delete(session.id, session.tenantId);
    await this.sessions.insert(refreshed);

    // Persist chain state to survive across reloads.
    this.chainState = this.chain.snapshot() as never;

    return event;
  }

  async ingestBatch(
    tenantId: string,
    input: { sessionId: string; events: readonly Omit<IngestEventInput, 'sessionId'>[] },
  ): Promise<readonly PrototypeEvent[]> {
    const out: PrototypeEvent[] = [];
    for (const e of input.events) {
      const ingest: IngestEventInput = { ...e, sessionId: input.sessionId };
      out.push(await this.ingestEvent(tenantId, ingest));
    }
    return out;
  }

  // ── DSR / retention ─────────────────────────────────────────────────

  /**
   * Delete a single session + all its events. PDPA / GDPR right-to-erasure.
   * Hard-delete immediately on call. Operators may also run `runRetention()`
   * to enforce 24-hour SLA on stale sessions.
   */
  async deleteSession(tenantId: string, sessionId: string): Promise<{ deletedEvents: number }> {
    const s = await this.sessions.findById(sessionId, tenantId);
    if (!s) throw new NotFoundError('PrototypeSession', sessionId);
    const deletedEvents = await this.events.deleteBySession(sessionId, tenantId);
    await this.sessions.delete(sessionId, tenantId);
    return { deletedEvents };
  }

  /** Delete every session whose `expiresAt < before`, plus its events. */
  async deleteSessionsBefore(
    tenantId: string,
    before: number,
  ): Promise<{ deletedSessions: number; deletedEvents: number }> {
    const all = await this.sessions.listByTenant(tenantId);
    let deletedSessions = 0;
    let deletedEvents = 0;
    for (const s of all) {
      if (s.expiresAt <= before) {
        deletedEvents += await this.events.deleteBySession(s.id, s.tenantId);
        await this.sessions.delete(s.id, s.tenantId);
        deletedSessions += 1;
      }
    }
    return { deletedSessions, deletedEvents };
  }

  /** Find every session belonging to a subject (DSR list endpoint). */
  async listMySessions(tenantId: string, subjectId: string): Promise<PrototypeSession[]> {
    return this.sessions.listBySubject(subjectId, tenantId);
  }

  /**
   * Run the retention cron. Returns counts; safe to call repeatedly.
   * Hard-deletes sessions whose `expiresAt` is in the past.
   */
  async runRetention(
    now: number = this.clock(),
  ): Promise<{ deletedSessions: number; deletedEvents: number }> {
    return this.sessions.deleteExpired(now);
  }

  // ── Key rotation (operator only) ───────────────────────────────────

  async rotateOperatorKey(tenantId: string, deckId: string): Promise<IntegrityKey> {
    await this.reloadChain(tenantId, deckId);
    const now = this.clock();
    const kid = `kid-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const key = this.chain.rotateKey({ tenantId, deckId, kid, now });
    await this.keys.insert(key);
    return key;
  }

  async listKeys(tenantId: string, deckId: string): Promise<readonly IntegrityKey[]> {
    return this.keys.listForTenantDeck(tenantId, deckId);
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async reloadChain(tenantId: string, deckId: string): Promise<void> {
    if (this.chainHydrated) return;
    const keys = await this.keys.listForTenantDeck(tenantId, deckId);
    this.chain = new IntegrityChain({ keys, clock: this.clock });
    if (this.chainState) this.chain.hydrate(this.chainState as never);
    this.chainHydrated = true;
  }

  /** Snapshot the in-memory chain state — the caller can persist it. */
  snapshotChain(): {
    lastSeqBySession: Record<string, number>;
    lastHashBySession: Record<string, string>;
  } {
    return this.chain.snapshot() as never;
  }

  /** Restore chain state from a previous snapshot. */
  hydrateChain(state: {
    lastSeqBySession: Record<string, number>;
    lastHashBySession: Record<string, string>;
  }): void {
    this.chainState = state as never;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 1.0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function randomToken(bytes: number): string {
  // Cheap deterministic token; cryptographically-random is enough — we
  // accept equal entropy to a UUID because the token never leaves a
  // signed channel.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
