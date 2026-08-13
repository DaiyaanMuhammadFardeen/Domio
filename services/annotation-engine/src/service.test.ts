/**
 * @domio/annotation-engine — service tests.
 */

import { describe, expect, it } from 'vitest';
import {
  AnnotationService,
  InMemoryAnnotationStore,
  InMemoryIdempotencyStore,
  HashChainedAuditEmitter,
} from './index.js';
import type { AnnotationCommitInput, PenGeometry } from './types.js';

function penGeometry(strokeCount = 1, pointsPerStroke = 3): PenGeometry {
  const strokes = [];
  for (let s = 0; s < strokeCount; s++) {
    const stroke = [];
    for (let i = 0; i < pointsPerStroke; i++) {
      stroke.push({ x: i / pointsPerStroke, y: s / strokeCount, pressure: 0.5, t: i * 16 });
    }
    strokes.push(stroke);
  }
  return { strokes };
}

describe('AnnotationService', () => {
  it('commits a pen stroke and returns the canonical record', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
      idGenerator: (() => {
        let i = 0;
        return () => `id-${++i}`;
      })(),
    });
    const input: AnnotationCommitInput = {
      session_id: 's1',
      workspace_id: 'w1',
      slide_id: 'slide-1',
      kind: 'pen',
      geometry: penGeometry(),
      drawn_by: 'u1',
      expected_version: 1,
    };
    const r = await service.commit(input, { actorId: 'u1' });
    expect(r.annotation.id).toBe('id-1');
    expect(r.annotation.ephemeral).toBe(true);
    expect(r.annotation.saved_overlay_id).toBeNull();
    expect(r.version).toBe(1);
  });

  it('preserves stroke monotonic time across replay (determinism)', async () => {
    const store = new InMemoryAnnotationStore();
    const service = new AnnotationService({
      store,
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
      idGenerator: (() => {
        let i = 0;
        return () => `id-${++i}`;
      })(),
    });
    const geom = penGeometry(2, 5);
    await service.commit(
      {
        session_id: 's1',
        workspace_id: 'w1',
        slide_id: 'slide-1',
        kind: 'pen',
        geometry: geom,
        drawn_by: 'u1',
        expected_version: 1,
      },
      { actorId: 'u1' },
    );
    const all = await service.listForSession('s1', true);
    expect(all).toHaveLength(1);
    const stored = all[0]!.geometry as PenGeometry;
    expect(stored.strokes).toHaveLength(2);
    expect(stored.strokes[0]![0]!.t).toBe(0);
    expect(stored.strokes[1]![4]!.t).toBe(64);
    for (const stroke of stored.strokes) {
      let prev = -Infinity;
      for (const p of stroke) {
        expect(p.t).toBeGreaterThanOrEqual(prev);
        prev = p.t;
      }
    }
  });

  it('idempotency replays the same response', async () => {
    let nextId = 0;
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
      idGenerator: () => `id-${++nextId}`,
    });
    const baseInput = {
      session_id: 's1',
      workspace_id: 'w1',
      slide_id: 'slide-1',
      kind: 'pen' as const,
      geometry: penGeometry(),
      drawn_by: 'u1',
      expected_version: 1,
      idempotency_key: 'K1',
    };
    const r1 = await service.commit(baseInput, { actorId: 'u1' });
    const r2 = await service.commit(baseInput, { actorId: 'u1' });
    expect(r1.annotation.id).toBe(r2.annotation.id);
    const stored = await service.listForSession('s1', true);
    expect(stored).toHaveLength(1);
  });

  it('rolls back ephemeral annotations only', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
    });
    const c = await service.commit(
      {
        session_id: 's1',
        workspace_id: 'w1',
        slide_id: 'slide-1',
        kind: 'pen',
        geometry: penGeometry(),
        drawn_by: 'u1',
        expected_version: 1,
      },
      { actorId: 'u1' },
    );
    await service.rollback(
      {
        session_id: 's1',
        workspace_id: 'w1',
        annotation_id: c.annotation.id,
        expected_version: 2,
      },
      { actorId: 'u1' },
    );
    const all = await service.listForSession('s1', true);
    expect(all).toHaveLength(0);
  });

  it('promotes ephemeral to saved overlay', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
    });
    const c = await service.commit(
      {
        session_id: 's1',
        workspace_id: 'w1',
        slide_id: 'slide-1',
        kind: 'pen',
        geometry: penGeometry(),
        drawn_by: 'u1',
        expected_version: 1,
      },
      { actorId: 'u1' },
    );
    const promoted = await service.promote(
      {
        session_id: 's1',
        workspace_id: 'w1',
        annotation_id: c.annotation.id,
        expected_version: 2,
      },
      { actorId: 'u1' },
    );
    expect(promoted.ephemeral).toBe(false);
    expect(promoted.saved_overlay_id).toBeTruthy();
    const ephemeral = await service.listForSession('s1', true);
    expect(ephemeral).toHaveLength(0);
    const saved = await service.listSavedForSlide('slide-1');
    expect(saved).toHaveLength(1);
  });

  it('clears ephemeral on session end', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
    });
    await service.commit(
      {
        session_id: 's1',
        workspace_id: 'w1',
        slide_id: 'slide-1',
        kind: 'pen',
        geometry: penGeometry(),
        drawn_by: 'u1',
        expected_version: 1,
        ephemeral: false,
      },
      { actorId: 'u1' },
    );
    await service.commit(
      {
        session_id: 's1',
        workspace_id: 'w1',
        slide_id: 'slide-2',
        kind: 'pen',
        geometry: penGeometry(),
        drawn_by: 'u1',
        expected_version: 2,
      },
      { actorId: 'u1' },
    );
    await service.onSessionEnded('s1', 'w1');
    expect(await service.listForSession('s1', true)).toHaveLength(0);
    expect(await service.listSavedForSlide('slide-1')).toHaveLength(1);
  });

  it('rejects invalid geometry (out-of-range x/y)', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
    });
    await expect(
      service.commit(
        {
          session_id: 's1',
          workspace_id: 'w1',
          slide_id: 'slide-1',
          kind: 'pen',
          geometry: { strokes: [[{ x: 1.5, y: 0, pressure: 0.5, t: 0 }]] },
          drawn_by: 'u1',
          expected_version: 1,
        },
        { actorId: 'u1' },
      ),
    ).rejects.toThrow(/x\/y/);
  });

  it('rejects non-monotonic time', async () => {
    const service = new AnnotationService({
      store: new InMemoryAnnotationStore(),
      audit: new HashChainedAuditEmitter({ rootKey: 'test-root-key' }),
      idempotency: new InMemoryIdempotencyStore(),
    });
    await expect(
      service.commit(
        {
          session_id: 's1',
          workspace_id: 'w1',
          slide_id: 'slide-1',
          kind: 'pen',
          geometry: {
            strokes: [
              [
                { x: 0, y: 0, pressure: 0.5, t: 100 },
                { x: 0.5, y: 0, pressure: 0.5, t: 50 },
              ],
            ],
          },
          drawn_by: 'u1',
          expected_version: 1,
        },
        { actorId: 'u1' },
      ),
    ).rejects.toThrow(/monotonically/);
  });
});
