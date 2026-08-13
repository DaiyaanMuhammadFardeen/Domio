/**
 * inheritance-service — tests for Wave 11 §S11.8.
 *
 * Covers:
 *   - Offline fallback for all four exported functions.
 *   - Push mutates in-memory state.
 *   - Conflict resolution narrows the conflict list.
 *   - Pure helpers (groupChildrenByParent, findMaster, describeSyncStatus).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listInheritanceTree,
  pushSlides,
  listConflictingSlides,
  resolveConflict,
  groupChildrenByParent,
  findMaster,
  describeSyncStatus,
  __resetInheritanceStateForTests,
  __getInheritanceStateForTests,
} from './inheritance-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  __resetInheritanceStateForTests();
});

describe('inheritance-service — offline fallback', () => {
  it('listInheritanceTree returns master + derived decks when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const tree = await listInheritanceTree('deck-master', 'http://api.test');
    expect(tree.nodes.length).toBeGreaterThanOrEqual(4); // master + 3-4 derived
    expect(tree.nodes.length).toBeLessThanOrEqual(5);
    const master = findMaster(tree.nodes);
    expect(master?.id).toBe('deck-master');
    expect(tree.edges.length).toBeGreaterThanOrEqual(3);
  });

  it('listConflictingSlides returns 5-10 conflicts', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const conflicts = await listConflictingSlides('deck-master', 'http://api.test');
    expect(conflicts.length).toBeGreaterThanOrEqual(5);
    expect(conflicts.length).toBeLessThanOrEqual(10);
    // Every conflict should reference at least one known downstream deck.
    for (const c of conflicts) {
      expect(c.downstream_decks.length).toBeGreaterThanOrEqual(1);
      expect(['added', 'removed', 'modified']).toContain(c.kind);
    }
  });

  it('listInheritanceTree returns network data when endpoint returns 2xx', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        nodes: [{ id: 'm', title: 'm', version: '1', parent_id: null, last_synced_at_ms: 0, sync_status: 'in_sync', slide_count: 1 }],
        edges: [],
      }),
    })) as unknown as typeof fetch;

    const tree = await listInheritanceTree('m', 'http://api.test');
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]?.id).toBe('m');
    expect(tree.edges).toHaveLength(0);
  });
});

describe('inheritance-service — push mutation', () => {
  it('pushSlides records the push and clears affected diverged slides', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const before = __getInheritanceStateForTests();
    const beforeEdges = before.edges.filter((e) => e.parent_id === 'deck-master');
    expect(beforeEdges.length).toBeGreaterThan(0);

    const result = await pushSlides('deck-master', ['s3', 's5'], 'http://api.test');
    expect(result.affected_decks.length).toBeGreaterThanOrEqual(2);
    expect(result.pushed_at_ms).toBeGreaterThan(0);

    const after = __getInheritanceStateForTests();
    const afterEdges = after.edges.filter((e) => e.parent_id === 'deck-master');
    for (const e of afterEdges) {
      // The pushed slides should no longer be in any diverged list.
      expect(e.diverged_slide_ids).not.toContain('s3');
      expect(e.diverged_slide_ids).not.toContain('s5');
    }
  });

  it('pushSlides returns empty affected_decks for an unknown master', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await pushSlides('deck-does-not-exist', ['s1'], 'http://api.test');
    expect(result.affected_decks).toHaveLength(0);
  });

  it('pushSlides POSTs the slide_ids as JSON body when network is available', async () => {
    const mock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ pushed_at_ms: 1, affected_decks: ['a'] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await pushSlides('deck-master', ['s1', 's2'], 'http://api.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    const calledInit = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[1] as RequestInit | undefined;
    expect(calledUrl).toContain('/v1/inheritance/trees/deck-master/push');
    expect(calledInit?.method).toBe('POST');
    expect(JSON.parse(String(calledInit?.body))).toEqual({ slide_ids: ['s1', 's2'] });
  });
});

describe('inheritance-service — conflict resolution', () => {
  it('resolveConflict removes the conflict from the list', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const before = await listConflictingSlides('deck-master', 'http://api.test');
    expect(before.find((c) => c.slide_id === 's3')).toBeTruthy();

    await resolveConflict('deck-master', 's3', 'master', 'http://api.test');

    const after = await listConflictingSlides('deck-master', 'http://api.test');
    expect(after.find((c) => c.slide_id === 's3')).toBeUndefined();
  });

  it('resolveConflict defaults to master when no resolution is provided', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const before = await listConflictingSlides('deck-master', 'http://api.test');
    expect(before.find((c) => c.slide_id === 's5')).toBeTruthy();

    await resolveConflict('deck-master', 's5', undefined as unknown as 'master', 'http://api.test');

    const after = await listConflictingSlides('deck-master', 'http://api.test');
    expect(after.find((c) => c.slide_id === 's5')).toBeUndefined();
  });

  it('resolveConflict supports the both resolution', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await resolveConflict('deck-master', 's7', 'both', 'http://api.test');
    const after = await listConflictingSlides('deck-master', 'http://api.test');
    expect(after.find((c) => c.slide_id === 's7')).toBeUndefined();
  });
});

describe('inheritance-service — pure helpers', () => {
  it('groupChildrenByParent buckets edges correctly', () => {
    const edges = [
      { parent_id: 'a', child_id: 'x', inherited_slide_ids: [], diverged_slide_ids: [], last_pushed_at_ms: null },
      { parent_id: 'a', child_id: 'y', inherited_slide_ids: [], diverged_slide_ids: [], last_pushed_at_ms: null },
      { parent_id: 'b', child_id: 'z', inherited_slide_ids: [], diverged_slide_ids: [], last_pushed_at_ms: null },
    ];
    const grouped = groupChildrenByParent(edges);
    expect(grouped.get('a')?.length).toBe(2);
    expect(grouped.get('b')?.length).toBe(1);
    expect(grouped.get('missing')?.length).toBeUndefined();
  });

  it('findMaster returns the node with parent_id === null', () => {
    const nodes = [
      { id: 'a', title: 'a', version: '1', parent_id: 'm', last_synced_at_ms: 0, sync_status: 'in_sync' as const, slide_count: 1 },
      { id: 'm', title: 'm', version: '1', parent_id: null, last_synced_at_ms: 0, sync_status: 'in_sync' as const, slide_count: 1 },
    ];
    expect(findMaster(nodes)?.id).toBe('m');
    expect(findMaster([])).toBeNull();
  });

  it('describeSyncStatus maps every status to a label', () => {
    expect(describeSyncStatus('in_sync')).toBe('In sync');
    expect(describeSyncStatus('diverged')).toBe('Diverged');
    expect(describeSyncStatus('pending')).toBe('Pending');
  });
});
