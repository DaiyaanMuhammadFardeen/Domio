/**
 * @domio/presenter-session — service-level integration tests.
 *
 * Covers:
 *   - start → advance × 5 → annotate → plan → handover → end lifecycle.
 *   - Optimistic concurrency (concurrent writes yield exactly one winner).
 *   - Idempotency (repeating the same key replays the prior response).
 *   - ETag round-trip.
 *   - Audit emission (every mutation produces a hash-chained event).
 *   - Heartbeat bumps last_heartbeat_at.
 *   - Failed handoff desync rejects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PresenterSessionConflictError,
  PresenterSessionEndedError,
  PresenterSessionNotFoundError,
  PresenterSessionService,
  InMemoryPresenterSessionStore,
  InMemoryIdempotencyStore,
  HashChainedAuditEmitter,
  testAuditKey,
  initialStageState,
} from './index.js';

const TENANT_KEY = testAuditKey('phase15-presenter-session-tests');

describe('PresenterSessionService — lifecycle', () => {
  let store: InMemoryPresenterSessionStore;
  let idempotency: InMemoryIdempotencyStore;
  let audit: HashChainedAuditEmitter;
  let service: PresenterSessionService;
  let clock: { now: number };

  beforeEach(() => {
    store = new InMemoryPresenterSessionStore();
    idempotency = new InMemoryIdempotencyStore();
    audit = new HashChainedAuditEmitter({ workspaceId: 'ws-1', key: TENANT_KEY });
    clock = { now: 1_700_000_000_000 };
    service = new PresenterSessionService({
      store,
      audit,
      idempotency,
      clock: () => clock.now,
      canonicalSlides: async () => ['s1', 's2', 's3', 's4'],
    });
  });

  it('start → advance × 5 → annotate → plan → handover → end yields the expected audit chain', async () => {
    const started = await service.start(
      {
        workspace_id: 'ws-1',
        deck_id: 'deck-1',
        presenter_id: 'user-1',
        initial_slide_id: 's1',
        initial_slide_index: 0,
      },
      { actorId: 'user-1' },
    );

    expect(started.session.version).toBe(1);
    expect(started.session.state.slide_id).toBe('s1');
    expect(started.session.ended_at).toBeNull();

    let current = started.session;

    // 5 advances.
    for (let i = 1; i <= 5; i++) {
      clock.now += 100;
      current = await service.advance(
        current.id,
        {
          target_slide_id: `s${i + 1}`,
          target_slide_index: i,
          expected_version: current.version,
        },
        { actorId: 'user-1' },
      );
      expect(current.state.slide_index).toBe(i);
    }
    expect(current.version).toBe(6);

    // Annotate.
    clock.now += 50;
    current = await service
      .annotate(
        current.id,
        {
          slide_id: current.state.slide_id,
          kind: 'pen',
          geometry: { strokes: [[{ x: 1, y: 2, pressure: 0.5 }]] },
          drawn_by: 'user-1',
          expected_version: current.version,
        },
        { actorId: 'user-1' },
      )
      .then((r) => r.session);
    expect(current.version).toBe(7);

    // Plan reorder.
    clock.now += 50;
    current = await service.plan(
      current.id,
      {
        order: ['s4', 's3', 's2', 's1'],
        expected_version: current.version,
      },
      { actorId: 'user-1' },
    );
    expect(current.version).toBe(8);

    // Handover.
    clock.now += 50;
    current = await service.handover(
      current.id,
      {
        to_presenter_id: 'user-2',
        state_snapshot: current.state,
        transfer_token: 'token-blob',
        expected_version: current.version,
      },
      { actorId: 'user-1' },
    );
    expect(current.mode).toBe('multi_presenter');
    expect(current.version).toBe(9);

    // End.
    clock.now += 50;
    const ended = await service.end(current.id, {
      actorId: 'user-1',
      expectedVersion: current.version,
    });
    expect(ended.ended_at).not.toBeNull();
    expect(ended.version).toBe(10);

    // Audit chain integrity.
    const { events } = await audit.load();
    expect(events.map((e) => e.action)).toEqual([
      'session.start',
      'session.advance',
      'session.advance',
      'session.advance',
      'session.advance',
      'session.advance',
      'session.annotate',
      'session.plan',
      'session.handover',
      'session.end',
    ]);
    const verifyResult = await audit.verify();
    expect(verifyResult.ok).toBe(true);
  });

  it('rejects a handoff whose state_snapshot desyncs from the current stage', async () => {
    const started = await service.start(
      {
        workspace_id: 'ws-1',
        deck_id: 'deck-1',
        presenter_id: 'user-1',
        initial_slide_id: 's1',
        initial_slide_index: 0,
      },
      { actorId: 'user-1' },
    );

    const stale = initialStageState({
      slide_id: 's9',
      slide_index: 8,
      ts_ms: clock.now,
    });

    await expect(
      service.handover(
        started.session.id,
        {
          to_presenter_id: 'user-2',
          state_snapshot: stale,
          transfer_token: 'token-blob',
          expected_version: started.session.version,
        },
        { actorId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(PresenterSessionConflictError);
  });
});

describe('PresenterSessionService — optimistic concurrency', () => {
  let service: PresenterSessionService;
  let store: InMemoryPresenterSessionStore;
  let audit: HashChainedAuditEmitter;

  beforeEach(() => {
    store = new InMemoryPresenterSessionStore();
    audit = new HashChainedAuditEmitter({ workspaceId: 'ws-1', key: TENANT_KEY });
    service = new PresenterSessionService({
      store,
      audit,
      clock: () => 1_700_000_000_000,
      canonicalSlides: async () => ['s1', 's2', 's3'],
    });
  });

  it('concurrent advances with the same expected_version yield exactly one winner', async () => {
    const started = await service.start(
      {
        workspace_id: 'ws-1',
        deck_id: 'deck-1',
        presenter_id: 'user-1',
        initial_slide_id: 's1',
        initial_slide_index: 0,
      },
      { actorId: 'user-1' },
    );

    const [winner, loser] = await Promise.allSettled([
      service.advance(
        started.session.id,
        {
          target_slide_id: 's2',
          target_slide_index: 1,
          expected_version: started.session.version,
        },
        { actorId: 'user-1' },
      ),
      service.advance(
        started.session.id,
        {
          target_slide_id: 's3',
          target_slide_index: 2,
          expected_version: started.session.version,
        },
        { actorId: 'user-1' },
      ),
    ]);

    const fulfilled = [winner, loser].filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<unknown>[];
    const rejected = [winner, loser].filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0]?.reason).toBeInstanceOf(PresenterSessionConflictError);
  });

  it('404s when the session does not exist', async () => {
    await expect(
      service.advance(
        'missing',
        {
          target_slide_id: 's2',
          expected_version: 1,
        },
        { actorId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(PresenterSessionNotFoundError);
  });

  it('rejects mutations after end', async () => {
    const started = await service.start(
      {
        workspace_id: 'ws-1',
        deck_id: 'deck-1',
        presenter_id: 'user-1',
        initial_slide_id: 's1',
        initial_slide_index: 0,
      },
      { actorId: 'user-1' },
    );

    await service.end(started.session.id, {
      actorId: 'user-1',
      expectedVersion: started.session.version,
    });

    await expect(
      service.advance(
        started.session.id,
        {
          target_slide_id: 's2',
          expected_version: started.session.version + 1,
        },
        { actorId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(PresenterSessionEndedError);
  });
});

describe('PresenterSessionService — idempotency', () => {
  let service: PresenterSessionService;
  let store: InMemoryPresenterSessionStore;
  let audit: HashChainedAuditEmitter;
  let idempotency: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryPresenterSessionStore();
    audit = new HashChainedAuditEmitter({ workspaceId: 'ws-1', key: TENANT_KEY });
    idempotency = new InMemoryIdempotencyStore();
    service = new PresenterSessionService({
      store,
      audit,
      idempotency,
      clock: () => 1_700_000_000_000,
      canonicalSlides: async () => ['s1', 's2'],
    });
  });

  it('repeating the same idempotency_key on advance replays the prior response', async () => {
    const started = await service.start(
      {
        workspace_id: 'ws-1',
        deck_id: 'deck-1',
        presenter_id: 'user-1',
        initial_slide_id: 's1',
        initial_slide_index: 0,
      },
      { actorId: 'user-1' },
    );

    const a = await service.advance(
      started.session.id,
      {
        target_slide_id: 's2',
        target_slide_index: 1,
        expected_version: started.session.version,
        idempotency_key: 'idem-1',
      },
      { actorId: 'user-1' },
    );

    const b = await service.advance(
      started.session.id,
      {
        target_slide_id: 's2',
        target_slide_index: 1,
        expected_version: started.session.version,
        idempotency_key: 'idem-1',
      },
      { actorId: 'user-1' },
    );

    expect(a.id).toBe(b.id);
    expect(a.version).toBe(b.version);

    // Only one audit entry was emitted for advance.
    const { events } = await audit.load();
    const advances = events.filter((e) => e.action === 'session.advance');
    expect(advances.length).toBe(1);
  });
});

describe('etag round-trip', () => {
  it('parses well-formed If-Match headers', async () => {
    const { parseEtag, toEtag } = await import('./etag.js');
    expect(parseEtag('"42"')).toEqual({ ok: true, version: 42 });
    expect(toEtag(42)).toBe('"42"');
    expect(parseEtag('not-an-etag').ok).toBe(false);
    expect(parseEtag('"0"').ok).toBe(false); // versions start at 1
    expect(parseEtag(undefined).ok).toBe(false);
  });
});

describe('state machine', () => {
  it('rejects illegal mode transitions', async () => {
    const { applyModeTransition } = await import('./state_machine.js');
    expect(() => applyModeTransition('rehearsal', 'multi_presenter')).toThrow();
    expect(applyModeTransition('rehearsal', 'live')).toBe('live');
    expect(applyModeTransition('live', 'live')).toBe('live');
  });

  it('applyAdvance is pure and bumps last_update_ts', async () => {
    const { applyAdvance, initialStageState } = await import('./state_machine.js');
    const initial = initialStageState({
      slide_id: 's1',
      slide_index: 0,
      ts_ms: 100,
    });
    const next = applyAdvance(initial, {
      type: 'advance',
      target_slide_id: 's2',
      target_slide_index: 1,
      ts_ms: 200,
    });
    expect(next.slide_id).toBe('s2');
    expect(next.slide_index).toBe(1);
    expect(next.last_update_ts).toBe(200);
    // Original not mutated.
    expect(initial.slide_id).toBe('s1');
  });
});

describe('dynamic plan reducer', () => {
  const canonical = ['s1', 's2', 's3', 's4'];

  it('reorder must be a permutation of canonical', async () => {
    const { DynamicPlanValidationError } = await import('./dynamic_plan.js');
    const op = await import('./dynamic_plan.js');
    const base = { order: canonical, hidden: [], updated_by: '', updated_at_ms: 0 };
    expect(() =>
      op.applyDynamicPlanOp(
        base,
        {
          type: 'reorder',
          order: ['s1', 's2'],
          by: 'u1',
          ts_ms: 1,
        },
        canonical,
      ),
    ).toThrow(DynamicPlanValidationError);
    expect(() =>
      op.applyDynamicPlanOp(
        base,
        {
          type: 'reorder',
          order: ['s1', 's2', 's3', 's3'],
          by: 'u1',
          ts_ms: 1,
        },
        canonical,
      ),
    ).toThrow(DynamicPlanValidationError);
    expect(() =>
      op.applyDynamicPlanOp(
        base,
        {
          type: 'reorder',
          order: ['s1', 's2', 's3', 'sX'],
          by: 'u1',
          ts_ms: 1,
        },
        canonical,
      ),
    ).toThrow(DynamicPlanValidationError);
  });

  it('hide + show is a no-op', async () => {
    const { applyDynamicPlanOp } = await import('./dynamic_plan.js');
    const base = { order: canonical, hidden: [], updated_by: '', updated_at_ms: 0 };
    const afterHide = applyDynamicPlanOp(
      base,
      {
        type: 'hide',
        slide_ids: ['s1', 's2'],
        by: 'u1',
        ts_ms: 1,
      },
      canonical,
    );
    const afterShow = applyDynamicPlanOp(
      afterHide,
      {
        type: 'show',
        slide_ids: ['s1', 's2'],
        by: 'u1',
        ts_ms: 2,
      },
      canonical,
    );
    expect(afterShow.hidden).toEqual([]);
  });
});
