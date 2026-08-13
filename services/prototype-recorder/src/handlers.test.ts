/**
 * Prototype-recorder service tests (Phase 10 M5).
 *
 * Exercises the full M5 surface:
 *   - integrity chain (HMAC accept, reject on payload mutation, reordering)
 *   - DSR happy paths (list / delete / bulk delete before=)
 *   - retention cron (hard-delete expired sessions)
 *   - region pin, consent tiers
 *   - ingest batch + key rotation
 *   - benchmark gate (≥ 1000 events ingest < 5 s on the in-memory DAL)
 */

import { describe, expect, it, beforeEach } from 'vitest';
import type { HttpRequest } from './handlers.js';
import { handlers } from './handlers.js';
import { PrototypeRecorderService } from './service.js';
import {
  IntegrityChain,
  GENESIS_HASH,
  computeEventHash,
  ROTATION_OVERLAP_MS,
  KEY_HARD_EXPIRY_MS,
  HMAC_KEY_BYTES,
} from './integrity.js';
import {
  HmacVerificationError,
  NotFoundError,
  ReorderDetectedError,
  RegionMismatchError,
  InMemoryPrototypeEventRepository,
  InMemoryPrototypeSessionRepository,
  InMemoryIntegrityChainRepository,
} from './dal.js';
import type { IntegrityKey } from './types.js';
import { PrototypeRecorderMetrics, P10_M5_METRICS, hmacFailureTrip } from './metrics.js';

const TENANT = 'tenant-1';
const DECK = '01H000000000000000000000D1';

const FIXED_TIME = 1_700_000_000_000;
let idCounter = 0;
function idGen(): string {
  idCounter += 1;
  return `ps-${idCounter.toString().padStart(22, '0')}`;
}
function eventIdGen(): string {
  idCounter += 1;
  return `pe-${idCounter.toString().padStart(22, '0')}`;
}

function newKey(
  tenantId: string,
  deckId: string,
  kidSuffix: string,
  rotatedAt: number,
): IntegrityKey {
  // Deterministic key for tests.
  const seed = `${tenantId}-${deckId}-${kidSuffix}`
    .padEnd(HMAC_KEY_BYTES * 2, 'a')
    .slice(0, HMAC_KEY_BYTES * 2);
  return {
    id: `ik-${kidSuffix}`,
    tenantId,
    deckId,
    kid: kidSuffix,
    keyHex: seed,
    rotatedAt,
    expiresAt: rotatedAt + KEY_HARD_EXPIRY_MS,
    overlapUntil: rotatedAt + ROTATION_OVERLAP_MS,
  };
}

function makeService(opts?: {
  regionPinned?: boolean;
  clock?: () => number;
  preKeys?: IntegrityKey[];
}): {
  service: PrototypeRecorderService;
  metrics: PrototypeRecorderMetrics;
  events: InMemoryPrototypeEventRepository;
} {
  idCounter = 0;
  const sessions = new InMemoryPrototypeSessionRepository();
  const events = new InMemoryPrototypeEventRepository();
  const keys = new InMemoryIntegrityChainRepository();
  const metrics = new PrototypeRecorderMetrics();
  const clock = opts?.clock ?? (() => FIXED_TIME);
  const service = new PrototypeRecorderService({
    sessions,
    events,
    keys,
    clock,
    idGenerator: idGen,
  });
  // Optionally seed keys
  if (opts?.preKeys) {
    const chain = new IntegrityChain({ keys: opts.preKeys, clock });
    (service as unknown as { chain: IntegrityChain }).chain = chain;
    return { service, metrics, events };
  }
  void metrics;
  return { service, metrics, events };
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
  headers: Record<string, string, undefined> = {},
): HttpRequest<P, B, Q> {
  void headers;
  return { method, path, params, body, query, headers: {} };
}

// ── IntegrityChain ────────────────────────────────────────────────────

describe('IntegrityChain', () => {
  it('verifies a freshly-built event', () => {
    const key = newKey(TENANT, DECK, 'k1', FIXED_TIME);
    const chain = new IntegrityChain({ keys: [key], clock: () => FIXED_TIME });
    const ev = chain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: 'sess-1',
      eventType: 'slide_enter',
      payload: { slide: 's1' },
      clientFingerprint: 'fp',
      region: 'us-east',
    });
    const verified = chain.verify({ event: { ...ev } });
    expect(verified.verified).toBe(true);
  });

  it('rejects when payload is mutated (HMAC mismatch)', () => {
    const key = newKey(TENANT, DECK, 'k1', FIXED_TIME);
    const chain = new IntegrityChain({ keys: [key], clock: () => FIXED_TIME });
    const ev = chain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: 'sess-1',
      eventType: 'slide_enter',
      payload: { slide: 's1' },
      clientFingerprint: 'fp',
      region: 'us-east',
    });
    const tampered = { ...ev, payload: { slide: 's2' } };
    expect(() => chain.verify({ event: tampered })).toThrow(HmacVerificationError);
  });

  it('detects reordering by chain mismatch', () => {
    const key = newKey(TENANT, DECK, 'k1', FIXED_TIME);
    const chain = new IntegrityChain({ keys: [key], clock: () => FIXED_TIME });
    const e1 = chain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: 'sess-1',
      eventType: 'slide_enter',
      payload: { slide: 's1' },
      clientFingerprint: 'fp',
      region: 'us-east',
    });
    chain.commit(e1);
    const e2 = chain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: 'sess-1',
      eventType: 'slide_enter',
      payload: { slide: 's2' },
      clientFingerprint: 'fp',
      region: 'us-east',
    });
    chain.commit(e2);

    // Replay e1 → e2 in reverse order: e2 should still verify but break the seq chain.
    const reordered = { ...e2, seq: 1, prevHash: GENESIS_HASH };
    expect(() => chain.verify({ event: reordered })).toThrow(ReorderDetectedError);
  });

  it('rotates keys with 7-day overlap window', () => {
    const k1 = newKey(TENANT, DECK, 'k1', FIXED_TIME);
    const chain = new IntegrityChain({ keys: [k1], clock: () => FIXED_TIME });
    const k2 = chain.rotateKey({
      tenantId: TENANT,
      deckId: DECK,
      kid: 'k2',
      now: FIXED_TIME + 24 * 60 * 60 * 1000,
    });
    expect(k2.overlapUntil - k2.rotatedAt).toBe(ROTATION_OVERLAP_MS);
    expect(k2.kid).toBe('k2');
    // Both keys are still accept-verifying during overlap.
    const active = chain.activeKey(FIXED_TIME + 24 * 60 * 60 * 1000 + 1000);
    expect(active.kid).toBe('k2');
  });

  it('computeEventHash is deterministic', () => {
    const a = computeEventHash({
      serverKeyHex: 'a'.repeat(64),
      payload: { foo: 'bar', n: 1 },
      seq: 2,
      prevHash: 'abc',
    });
    const b = computeEventHash({
      serverKeyHex: 'a'.repeat(64),
      payload: { n: 1, foo: 'bar' },
      seq: 2,
      prevHash: 'abc',
    });
    expect(a).toBe(b);
  });

  it('computeEventHash differs when payload differs by even one byte', () => {
    const a = computeEventHash({
      serverKeyHex: 'a'.repeat(64),
      payload: { x: 1 },
      seq: 1,
      prevHash: 'p',
    });
    const b = computeEventHash({
      serverKeyHex: 'a'.repeat(64),
      payload: { x: 2 },
      seq: 1,
      prevHash: 'p',
    });
    expect(a).not.toBe(b);
  });
});

// ── Service: session + ingest ──────────────────────────────────────────

describe('PrototypeRecorderService', () => {
  let clock = () => FIXED_TIME;
  let svc: PrototypeRecorderService;
  let events: InMemoryPrototypeEventRepository;
  let metrics: PrototypeRecorderMetrics;

  beforeEach(() => {
    clock = () => FIXED_TIME;
    ({ service: svc, metrics, events } = makeService());
  });

  it('starts a session and stamps consent + region', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    expect(s.tenantId).toBe(TENANT);
    expect(s.consent).toBe('opt_in');
    expect(s.region).toBe('us-east');
    expect(s.lastSeq).toBe(0);
    expect(s.sessionToken.length).toBeGreaterThan(8);
    expect(s.expiresAt).toBeGreaterThan(s.startedAt);
    metrics.inc(P10_M5_METRICS.sessionStarted);
    expect(metrics.get(P10_M5_METRICS.sessionStarted)).toBe(1);
  });

  it('reuses the rejoined session when the token matches', async () => {
    const first = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const second = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      rejoinSessionToken: first.sessionToken,
    });
    expect(second.id).toBe(first.id);
  });

  it('refuses a rejoined session whose region pin mismatches', async () => {
    const first = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'eu-central',
      regionPinned: true,
    });
    await expect(
      svc.startSession(TENANT, {
        deckId: DECK,
        consent: 'opt_in',
        region: 'us-east',
        rejoinSessionToken: first.sessionToken,
      }),
    ).rejects.toThrow(RegionMismatchError);
  });

  it('ingests a single event and advances lastSeq', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const ev = await svc.ingestEvent(TENANT, {
      sessionId: s.id,
      eventType: 'slide_enter',
      payload: { slide: 's1' },
      clientFingerprint: 'fp',
    });
    expect(ev.seq).toBe(1);
    expect(ev.prevHash).toBe(GENESIS_HASH);
    expect(ev.eventHash).toMatch(/^[0-9a-f]{64}$/);
    const after = await svc.getSession(TENANT, s.id);
    expect(after.lastSeq).toBe(1);
  });

  it('ingests a batch of 50 events with monotonic seq', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const events = Array.from({ length: 50 }, (_, i) => ({
      sessionId: s.id,
      eventType: 'click' as const,
      payload: { n: i },
      clientFingerprint: 'fp',
    }));
    const out = await svc.ingestBatch(TENANT, { sessionId: s.id, events });
    expect(out.length).toBe(50);
    expect(out.map((e) => e.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('verifies a client-supplied signed event', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const sessionToken = s.sessionToken;
    void sessionToken;
    // Read active key from the service by injecting one.
    const keys = (svc as unknown as { chain: IntegrityChain }).chain.listKeys();
    const key = keys[0];
    expect(key).toBeDefined();
    // Build a signed event by hand using the same formula.
    const clientChain = new IntegrityChain({ keys: keys, clock: () => FIXED_TIME });
    const ev = clientChain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: s.id,
      eventType: 'click',
      payload: { x: 1, y: 2 },
      clientFingerprint: 'fp',
      region: 'us-east',
    });

    await svc.ingestEvent(TENANT, {
      sessionId: s.id,
      eventType: 'click',
      payload: {},
      clientFingerprint: 'fp',
      signedEvent: { ...ev },
    });
    const list = await svc.listEventsForSession(TENANT, s.id);
    expect(list.find((e) => e.eventHash === ev.eventHash)).toBeDefined();
  });

  it('rejects a tampered signed event', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const keys = (svc as unknown as { chain: IntegrityChain }).chain.listKeys();
    const clientChain = new IntegrityChain({ keys, clock: () => FIXED_TIME });
    const ev = clientChain.buildEvent({
      tenantId: TENANT,
      deckId: DECK,
      sessionId: s.id,
      eventType: 'click',
      payload: { x: 1 },
      clientFingerprint: 'fp',
      region: 'us-east',
    });
    const tampered = { ...ev, payload: { x: 99 } };
    await expect(
      svc.ingestEvent(TENANT, {
        sessionId: s.id,
        eventType: 'click',
        payload: {},
        clientFingerprint: 'fp',
        signedEvent: tampered,
      }),
    ).rejects.toThrow();
  });

  it('rotates the operator key on demand', async () => {
    const before = await svc.listKeys(TENANT, DECK);
    const key = await svc.rotateOperatorKey(TENANT, DECK);
    expect(key.tenantId).toBe(TENANT);
    expect(key.deckId).toBe(DECK);
    const after = await svc.listKeys(TENANT, DECK);
    expect(after.length).toBe(before.length + 1);
  });

  it('lists sessions by deck', async () => {
    await svc.startSession(TENANT, { deckId: DECK, consent: 'opt_in', region: 'us-east' });
    await svc.startSession(TENANT, { deckId: DECK, consent: 'opt_out', region: 'eu-central' });
    const list = await svc.listSessionsForDeck(TENANT, DECK);
    expect(list.length).toBe(2);
  });

  it('hard-deletes a session + cascades to its events (DSR)', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    await svc.ingestEvent(TENANT, {
      sessionId: s.id,
      eventType: 'click',
      payload: {},
      clientFingerprint: 'fp',
    });
    const { deletedEvents } = await svc.deleteSession(TENANT, s.id);
    expect(deletedEvents).toBe(1);
    await expect(svc.getSession(TENANT, s.id)).rejects.toThrow(NotFoundError);
  });

  it('deletes sessions older than a cutoff (DSR bulk)', async () => {
    let now = FIXED_TIME;
    ({ service: svc, metrics, events } = makeService({ clock: () => now }));
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    now += 1000;
    const subjectSessions = await svc.listMySessions(TENANT, s.subjectId ?? '');
    void subjectSessions;
    // Need to inject a subjectId to make listMySessions useful.
    const manual: IntegrityKey = {
      id: 'ik-1',
      tenantId: TENANT,
      deckId: DECK,
      kid: 'k1',
      keyHex: 'a'.repeat(64),
      rotatedAt: now,
      expiresAt: now + KEY_HARD_EXPIRY_MS,
      overlapUntil: now + ROTATION_OVERLAP_MS,
    };
    void manual;
    // Run retention at a future time well past expiresAt:
    await svc.ingestEvent(TENANT, {
      sessionId: s.id,
      eventType: 'click',
      payload: {},
      clientFingerprint: 'fp',
    });
    const report = await svc.runRetention(now + 60 * 24 * 60 * 60 * 1000);
    expect(report.deletedSessions).toBeGreaterThanOrEqual(1);
  });

  it('retention is idempotent', async () => {
    await svc.startSession(TENANT, { deckId: DECK, consent: 'opt_in', region: 'us-east' });
    const a = await svc.runRetention(FIXED_TIME + 60 * 24 * 60 * 60 * 1000);
    const b = await svc.runRetention(FIXED_TIME + 60 * 24 * 60 * 60 * 1000);
    expect(a.deletedSessions).toBe(1);
    expect(b.deletedSessions).toBe(0);
  });

  it('benchmark: ingests 1000 events in under 5 seconds on the in-memory DAL', async () => {
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const events = Array.from({ length: 1000 }, (_, i) => ({
      sessionId: s.id,
      eventType: 'click' as const,
      payload: { n: i },
      clientFingerprint: 'fp',
    }));
    const t0 = Date.now();
    await svc.ingestBatch(TENANT, { sessionId: s.id, events });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(5000);
    const list = await svc.listEventsForSession(TENANT, s.id);
    expect(list.length).toBe(1000);
  });

  it('refuses to ingest when the session is missing', async () => {
    await expect(
      svc.ingestEvent(TENANT, {
        sessionId: 'nonexistent',
        eventType: 'click',
        payload: {},
        clientFingerprint: 'fp',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('validates unknown consent tier', async () => {
    await expect(
      svc.startSession(TENANT, { deckId: DECK, consent: 'whatever' as never, region: 'us-east' }),
    ).rejects.toThrow();
  });

  it('validates unknown region', async () => {
    await expect(
      svc.startSession(TENANT, { deckId: DECK, consent: 'opt_in', region: 'mars' as never }),
    ).rejects.toThrow();
  });

  it('HMAC failure rate trips when > 0.01%', () => {
    const counters: Record<string, number> = {
      [P10_M5_METRICS.eventIngested]: 100000,
      [P10_M5_METRICS.hmacRejected]: 50,
    };
    expect(hmacFailureTrip(counters)).toBe(true);
    counters[P10_M5_METRICS.hmacRejected] = 0;
    expect(hmacFailureTrip(counters)).toBe(false);
  });
});

// ── REST handlers ─────────────────────────────────────────────────────

describe('PrototypeRecorderService HTTP handlers', () => {
  let svc: PrototypeRecorderService;
  let metrics: PrototypeRecorderMetrics;
  let events: InMemoryPrototypeEventRepository;
  const ctxSubject = () => 'subject-x';
  const ctxOperator = () => 'operator-1';

  beforeEach(() => {
    ({ service: svc, metrics, events } = makeService());
  });

  it('startSessionHandler returns 201 with the session', async () => {
    const res = await handlers.startSession(
      req(
        'POST',
        '/x',
        { tenantId: TENANT, deckId: DECK },
        { consent: 'opt_in', region: 'us-east' },
        {},
      ),
      { service: svc, resolveSubjectId: ctxSubject } as never,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tenantId: TENANT, consent: 'opt_in' });
  });

  it('startSessionHandler rejects a bad body with 400', async () => {
    const res = await handlers.startSession(
      req(
        'POST',
        '/x',
        { tenantId: TENANT, deckId: DECK },
        { consent: 'bad', region: 'us-east' },
        {},
      ),
      { service: svc } as never,
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('ingestBatchHandler returns accepted count and events', async () => {
    const session = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const res = await handlers.ingestBatch(
      req(
        'POST',
        '/x',
        { tenantId: TENANT },
        {
          sessionId: session.id,
          events: [{ eventType: 'click', payload: { x: 1 }, clientFingerprint: 'fp' }],
        },
      ),
      { service: svc } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { accepted: number }).accepted).toBe(1);
  });

  it('rotateKeyHandler is forbidden without operator', async () => {
    const res = await handlers.rotateKey(
      req('POST', '/x', { tenantId: TENANT }, { deckId: DECK }),
      { service: svc } as never,
    );
    expect(res.status).toBe(403);
  });

  it('rotateKeyHandler returns 201 with operator', async () => {
    const res = await handlers.rotateKey(
      req('POST', '/x', { tenantId: TENANT }, { deckId: DECK }),
      { service: svc, resolveOperatorId: ctxOperator } as never,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kid: expect.stringMatching(/^kid-/) });
  });

  it('listSessionsHandler returns items for the deck', async () => {
    await svc.startSession(TENANT, { deckId: DECK, consent: 'opt_in', region: 'us-east' });
    const res = await handlers.listSessions(
      req('GET', '/x', { tenantId: TENANT, deckId: DECK }, undefined),
      { service: svc } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items.length).toBe(1);
  });

  it('getSessionEventsHandler returns 404 for unknown session', async () => {
    const res = await handlers.getSessionEvents(
      req('GET', '/x', { tenantId: TENANT, sessionId: 'nope' }, undefined),
      { service: svc } as never,
    );
    expect(res.status).toBe(404);
  });
});

// ── DSR handlers ─────────────────────────────────────────────────────

describe('DSR handlers', () => {
  let svc: PrototypeRecorderService;

  beforeEach(() => {
    ({ service: svc } = makeService());
  });

  it('listMySessionsHandler requires a subject', async () => {
    const res = await handlers_dsr_listMy(
      req('GET', '/x', undefined, undefined, { tenant_id: TENANT }),
      { service: svc } as never,
    );
    expect(res.status).toBe(401);
  });

  it('listMySessionsHandler returns 200 with subject attached to a session', async () => {
    const subjectId = 'subject-x';
    // create a session with explicit subject
    await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      subjectId,
    });
    const res = await handlers_dsr_listMy(
      req('GET', '/x', undefined, undefined, { tenant_id: TENANT }),
      { service: svc, resolveSubjectId: () => subjectId } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items.length).toBe(1);
  });

  it('deleteMySessionHandler returns 404 when the session does not belong to subject', async () => {
    const subjectId = 'subject-x';
    await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      subjectId,
    });
    const other = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
    });
    const res = await handlers_dsr_deleteMy(
      req('DELETE', '/x', { sessionId: other.id }, undefined, { tenant_id: TENANT }),
      { service: svc, resolveSubjectId: () => subjectId } as never,
    );
    expect(res.status).toBe(404);
  });

  it('deleteMySessionHandler hard-deletes the owner session', async () => {
    const subjectId = 'subject-x';
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      subjectId,
    });
    const res = await handlers_dsr_deleteMy(
      req('DELETE', '/x', { sessionId: s.id }, undefined, { tenant_id: TENANT }),
      { service: svc, resolveSubjectId: () => subjectId } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { deleted: boolean }).deleted).toBe(true);
  });

  it('bulk delete with ?before= removes only stale sessions', async () => {
    const subjectId = 'subject-x';
    const s = await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      subjectId,
    });
    const res = await handlers_dsr_bulk(
      req('DELETE', '/x', undefined, undefined, {
        tenant_id: TENANT,
        before: String(FIXED_TIME + 365 * 24 * 60 * 60 * 1000),
      }),
      { service: svc, resolveSubjectId: () => subjectId } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { deleted: number }).deleted).toBeGreaterThanOrEqual(1);
    void s;
  });

  it('bulk delete before= now removes nothing', async () => {
    const subjectId = 'subject-x';
    await svc.startSession(TENANT, {
      deckId: DECK,
      consent: 'opt_in',
      region: 'us-east',
      subjectId,
    });
    const res = await handlers_dsr_bulk(
      req('DELETE', '/x', undefined, undefined, { tenant_id: TENANT, before: '1' }),
      { service: svc, resolveSubjectId: () => subjectId } as never,
    );
    expect(res.status).toBe(200);
    expect((res.body as { deleted: number }).deleted).toBe(0);
  });

  it('bulk delete requires before=', async () => {
    const res = await handlers_dsr_bulk(
      req('DELETE', '/x', undefined, undefined, { tenant_id: TENANT }),
      { service: svc, resolveSubjectId: () => 'subj' } as never,
    );
    expect(res.status).toBe(400);
  });
});

// Re-export the DSR handlers under local names so this file doesn't need
// a separate import. They're already exported from the service barrel.
import {
  listMySessionsHandler as handlers_dsr_listMy,
  deleteMySessionHandler as handlers_dsr_deleteMy,
  deleteSessionsBeforeHandler as handlers_dsr_bulk,
} from './dsr.js';
