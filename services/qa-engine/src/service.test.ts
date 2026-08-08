import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { InMemoryQaStore } from './store/mem_store.js';
import { QaEngine } from './service.js';
import { HashChainedQaAuditEmitter } from './audit/emit.js';

describe('qa-engine', () => {
  let bus: InMemoryEdgeBus;
  let store: InMemoryQaStore;
  let audit: HashChainedQaAuditEmitter;
  let engine: QaEngine;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    store = new InMemoryQaStore();
    audit = new HashChainedQaAuditEmitter({ workspaceId: 'w1', key: new Uint8Array(32) });
    engine = new QaEngine({ store, bus, audit });
  });

  it('creates a thread', async () => {
    const t = await engine.createThread({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1', created_by: 'p1',
    });
    expect(t.status).toBe('open');
    expect(t.version).toBe(1);
  });

  it('submits and upvotes', async () => {
    const t = await engine.createThread({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1', created_by: 'p1',
    });
    const s = await engine.submit({
      workspace_id: 'w1', session_id: 's1', thread_id: t.id,
      participant_id: 'u-1', body: 'How does this work?', idempotency_key: 'k1',
    });
    expect(s.upvotes).toBe(0);
    const up = await engine.upvote({ workspace_id: 'w1', submit_id: s.id, participant_id: 'u-2' });
    expect(up.upvotes).toBe(1);
    await expect(
      engine.upvote({ workspace_id: 'w1', submit_id: s.id, participant_id: 'u-2' }),
    ).rejects.toThrow(/already upvoted/);
  });

  it('promotes to parking lot', async () => {
    const t = await engine.createThread({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1', created_by: 'p1',
    });
    const s = await engine.submit({
      workspace_id: 'w1', session_id: 's1', thread_id: t.id,
      participant_id: 'u-1', body: 'Off-topic question', idempotency_key: 'k1',
    });
    const r = await engine.promoteToParkingLot({
      thread_id: t.id, submit_id: s.id, actor_id: 'p1',
    });
    expect(r.promoted).toBe(true);
    expect(r.submit.id).toBe(s.id);
  });

  it('defers a thread', async () => {
    const t = await engine.createThread({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1', created_by: 'p1',
    });
    const d = await engine.defer(t.id, 1, 'p1');
    expect(d.status).toBe('deferred');
    expect(d.version).toBe(2);
  });

  it('rejects too-long bodies', async () => {
    await expect(
      engine.submit({
        workspace_id: 'w1', session_id: 's1', participant_id: 'u-1',
        body: 'x'.repeat(600), idempotency_key: 'k1',
      }),
    ).rejects.toThrow(/too long/);
  });

  it('emits a verifiable audit chain', async () => {
    const t = await engine.createThread({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1', created_by: 'p1',
    });
    await engine.submit({
      workspace_id: 'w1', session_id: 's1', thread_id: t.id,
      participant_id: 'u-1', body: 'Question', idempotency_key: 'k1',
    });
    const v = await audit.verify();
    expect(v.ok).toBe(true);
  });
});
