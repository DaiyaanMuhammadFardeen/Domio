import { describe, expect, it } from 'vitest';
import { participantId } from '@domio/audience-service';
import { InMemorySessionCoordinatorStore, SessionCoordinatorService, SessionNotFoundError, type MembershipRow } from './index.js';

function makeMembership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    workspace_id: 'w1',
    session_id: 's1',
    participant_id: participantId('p1'),
    participant_session_id: 'psess-1',
    shard_index: 0,
    state: 'active',
    joined_at: '2026-01-01T00:00:00.000Z',
    last_seen_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildService(opts: { sessionCode?: () => Promise<string> } = {}) {
  const store = new InMemorySessionCoordinatorStore();
  const service = new SessionCoordinatorService({
    store,
    sessionResolver: opts.sessionCode ?? (async () => 'ABC123XY'),
  });
  return { store, service };
}

describe('session-coordinator', () => {
  it('summarises a session from membership rows', async () => {
    const { store, service } = buildService();
    store.upsert(makeMembership({ participant_id: participantId('p1'), shard_index: 0 }));
    store.upsert(makeMembership({ participant_id: participantId('p2'), shard_index: 1 }));
    store.upsert(makeMembership({ participant_id: participantId('p3'), shard_index: 0, state: 'left' }));
    const summary = await service.summarize({ workspace_id: 'w1', session_id: 's1' });
    expect(summary.total_participants).toBe(3);
    expect(summary.active_participants).toBe(2);
    expect(summary.shards_touched).toBe(2);
    expect(summary.session_code).toBe('ABC123XY');
  });

  it('throws SessionNotFoundError when no rows exist', async () => {
    const { service } = buildService();
    await expect(service.summarize({ workspace_id: 'w1', session_id: 's-missing' }))
      .rejects.toThrow(/not found/);
  });

  it('listMembership returns paginated rows', async () => {
    const { store, service } = buildService();
    for (let i = 0; i < 5; i++) {
      store.upsert(makeMembership({
        participant_id: participantId(`p${i}`),
        last_seen_at: `2026-01-01T00:00:0${i}.000Z`,
      }));
    }
    const page = await service.listMembership({ workspace_id: 'w1', session_id: 's1', limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
  });

  it('listMembership filters by since_ms', async () => {
    const { store, service } = buildService();
    store.upsert(makeMembership({ participant_id: participantId('p1'), last_seen_at: '2026-01-01T00:00:00.000Z' }));
    store.upsert(makeMembership({ participant_id: participantId('p2'), last_seen_at: '2026-01-01T00:01:00.000Z' }));
    const page = await service.listMembership({
      workspace_id: 'w1', session_id: 's1', since_ms: Date.parse('2026-01-01T00:00:30.000Z'),
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.participant_id).toBe('p2');
  });

  it('fanoutPlan returns sorted shards and count', async () => {
    const { store, service } = buildService();
    store.upsert(makeMembership({ participant_id: participantId('p1'), shard_index: 7 }));
    store.upsert(makeMembership({ participant_id: participantId('p2'), shard_index: 2 }));
    store.upsert(makeMembership({ participant_id: participantId('p3'), shard_index: 2 }));
    store.upsert(makeMembership({ participant_id: participantId('p4'), shard_index: 5, state: 'left' }));
    const plan = await service.fanoutPlan({ workspace_id: 'w1', session_id: 's1' });
    expect(plan.shards).toEqual([2, 7]);
    expect(plan.fanout_size).toBe(3);
  });

  it('fanoutPlan returns empty for unknown session', async () => {
    const { service } = buildService();
    await expect(service.fanoutPlan({ workspace_id: 'w1', session_id: 's-missing' }))
      .rejects.toThrow(SessionNotFoundError);
  });

  it('exportMembership returns all rows', async () => {
    const { store, service } = buildService();
    store.upsert(makeMembership({ participant_id: participantId('p1') }));
    store.upsert(makeMembership({ participant_id: participantId('p2') }));
    const rows = await service.exportMembership({ workspace_id: 'w1', session_id: 's1' });
    expect(rows).toHaveLength(2);
  });

  it('refuses to construct without a store', () => {
    expect(() => new SessionCoordinatorService({
      store: { summarize: 0, listMembership: 0, fanoutPlan: 0, exportMembership: 0 } as never,
    })).toThrow(/store is required/);
  });

  it('isolates rows by workspace_id', async () => {
    const { store, service } = buildService();
    store.upsert(makeMembership({ workspace_id: 'w1', participant_id: participantId('p1') }));
    store.upsert(makeMembership({ workspace_id: 'w2', participant_id: participantId('p2') }));
    const summary = await service.summarize({ workspace_id: 'w1', session_id: 's1' });
    expect(summary.total_participants).toBe(1);
  });

  it('rejects listMembership without workspace_id', async () => {
    const { service } = buildService();
    await expect(service.listMembership({ workspace_id: '', session_id: 's1' })).rejects.toThrow(/workspace/);
  });
});