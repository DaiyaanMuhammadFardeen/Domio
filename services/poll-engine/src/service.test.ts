import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { InMemoryPollStore } from './store/mem_store.js';
import { PollEngine } from './service.js';
import { HashChainedPollAuditEmitter } from './audit/emit.js';

describe('poll-engine', () => {
  let bus: InMemoryEdgeBus;
  let store: InMemoryPollStore;
  let audit: HashChainedPollAuditEmitter;
  let engine: PollEngine;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    store = new InMemoryPollStore();
    audit = new HashChainedPollAuditEmitter({ workspaceId: 'w1', key: new Uint8Array(32) });
    engine = new PollEngine({ store, bus, audit });
  });

  it('creates a poll in draft state', async () => {
    const poll = await engine.create({
      workspace_id: 'w1',
      session_id: 's1',
      widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
      created_by: 'presenter-1',
    });
    expect(poll.status).toBe('draft');
    expect(poll.version).toBe(1);
    expect(poll.options).toHaveLength(2);
  });

  it('opens, votes, closes', async () => {
    const poll = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
      created_by: 'p1',
    });
    const opened = await engine.open(poll.id, 1, 'p1');
    expect(opened.status).toBe('open');
    await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
      option_index: 0, idempotency_key: 'k1',
    });
    await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-2',
      option_index: 0, idempotency_key: 'k2',
    });
    await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-3',
      option_index: 2, idempotency_key: 'k3',
    });
    const agg = await engine.aggregate(poll.id);
    expect(agg.total).toBe(3);
    expect(agg.counts[0]).toBe(2);
    expect(agg.counts[2]).toBe(1);
    const closed = await engine.close(poll.id, opened.version, 'p1');
    expect(closed.status).toBe('closed');
  });

  it('rejects duplicate votes from the same participant', async () => {
    const poll = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
      created_by: 'p1',
    });
    await engine.open(poll.id, 1, 'p1');
    await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
      option_index: 0, idempotency_key: 'k1',
    });
    await expect(
      engine.castVote({
        workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
        option_index: 1, idempotency_key: 'k2',
      }),
    ).rejects.toThrow(/already voted/);
  });

  it('rejects votes on closed polls', async () => {
    const poll = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
      created_by: 'p1',
    });
    const opened = await engine.open(poll.id, 1, 'p1');
    const closed = await engine.close(poll.id, opened.version + 0, 'p1');
    expect(closed.status).toBe('closed');
    await expect(
      engine.castVote({
        workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
        option_index: 0, idempotency_key: 'k1',
      }),
    ).rejects.toThrow(/not open/);
  });

  it('emits a verifiable audit chain', async () => {
    const poll = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
      created_by: 'p1',
    });
    await engine.open(poll.id, 1, 'p1');
    await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
      option_index: 0, idempotency_key: 'k1',
    });
    const v = await audit.verify();
    expect(v.ok).toBe(true);
    const { events } = await audit.load();
    expect(events.map((e) => e.action)).toEqual(['poll.create', 'poll.open', 'poll.vote']);
  });

  it('idempotent vote replays return the same row', async () => {
    const poll = await engine.create({
      workspace_id: 'w1', session_id: 's1', widget_id: 'w-1',
      question: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }],
      created_by: 'p1',
    });
    await engine.open(poll.id, 1, 'p1');
    const v1 = await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
      option_index: 0, idempotency_key: 'k1',
    });
    const v2 = await engine.castVote({
      workspace_id: 'w1', poll_id: poll.id, participant_id: 'u-1',
      option_index: 0, idempotency_key: 'k1',
    });
    expect(v1.id).toBe(v2.id);
    const agg = await engine.aggregate(poll.id);
    expect(agg.total).toBe(1);
  });
});
