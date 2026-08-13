/**
 * Agent-handoff service tests — Wave 10 §S10.8.
 *
 * Verifies the seed pipelines, fallback behavior, and replay
 * side-effect. Uses mocked fetch + afterEach cleanup so upstream
 * responses are isolated to the cases that need them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAgentHandoffSeed,
  getPipeline,
  listPipelines,
  replayPipeline,
  type Pipeline,
} from './agent-handoff-service';

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function mockFetch(
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    const res: MockResponse = {
      ok: options.ok ?? true,
      status: options.status ?? 200,
      json: async () => body,
    };
    return res as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetAgentHandoffSeed();
});

describe('agent-handoff-service', () => {
  it('listPipelines returns 3+ pipelines covering different statuses', async () => {
    const list = await listPipelines();
    expect(list.length).toBeGreaterThanOrEqual(3);
    const statuses = new Set(list.map((p) => p.status));
    expect(statuses.has('done')).toBe(true);
    expect(statuses.has('running')).toBe(true);
    expect(statuses.has('error')).toBe(true);
  });

  it('orders pipelines most-recent first', async () => {
    const list = await listPipelines();
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const curr = list[i];
      if (!prev || !curr) continue;
      expect(prev.started_at_ms).toBeGreaterThanOrEqual(curr.started_at_ms);
    }
  });

  it('default pipeline walks research → deck-builder → brand-compliance → rehearsal-coach', async () => {
    const list = await listPipelines();
    const canonical = list.find((p) => p.deck_id === 'deck-q3-allhands');
    expect(canonical).toBeDefined();
    if (!canonical) return;
    const ids = canonical.nodes.map((n) => n.id);
    expect(ids).toEqual(['research', 'deck-builder', 'brand-compliance', 'rehearsal-coach']);
    expect(canonical.edges).toEqual([
      { from: 'research', to: 'deck-builder', label: 'facts' },
      { from: 'deck-builder', to: 'brand-compliance', label: 'outline' },
      { from: 'brand-compliance', to: 'rehearsal-coach', label: 'verified' },
    ]);
  });

  it('every node has handoff tokens, inputs, and outputs', async () => {
    const list = await listPipelines();
    for (const p of list) {
      for (const n of p.nodes) {
        expect(n.inputs).toBeDefined();
        expect(n.outputs).toBeDefined();
        expect(Array.isArray(n.handoff_tokens)).toBe(true);
        expect((n.handoff_tokens ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it('listPipelines falls back to seed when fetch errors', async () => {
    mockFetch({}, { ok: false, status: 500 });
    const list = await listPipelines();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => typeof p.run_id === 'string')).toBe(true);
  });

  it('listPipelines uses upstream items when fetch returns them', async () => {
    const upstream: Pipeline = {
      run_id: 'run-upstream-1',
      deck_id: 'deck-upstream',
      status: 'done',
      nodes: [
        {
          id: 'research',
          name: 'Research',
          role: 'research',
          status: 'done',
          inputs: {},
          outputs: {},
          handoff_tokens: ['tok-1'],
          latency_ms: 100,
        },
      ],
      edges: [],
      started_at_ms: Date.now(),
    };
    mockFetch({ items: [upstream] });
    const list = await listPipelines();
    expect(list).toHaveLength(1);
    expect(list[0]?.run_id).toBe('run-upstream-1');
  });

  it('getPipeline returns the matching pipeline by run_id', async () => {
    const list = await listPipelines();
    const target = list[0];
    expect(target).toBeDefined();
    if (!target) return;
    const detail = await getPipeline(target.run_id);
    expect(detail?.run_id).toBe(target.run_id);
    expect(detail?.nodes.length).toBeGreaterThan(0);
  });

  it('getPipeline returns null for an unknown id', async () => {
    expect(await getPipeline('run-does-not-exist')).toBeNull();
  });

  it('getPipeline returns null without calling fetch for empty id', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getPipeline('')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getPipeline falls back to seed when upstream errors', async () => {
    mockFetch({}, { ok: false, status: 500 });
    const detail = await getPipeline('run-2026-08-13-001');
    expect(detail).not.toBeNull();
    expect(detail?.deck_id).toBe('deck-q3-allhands');
  });

  it('replayPipeline returns a new run_id and appends to list', async () => {
    const before = await listPipelines();
    const target = before[0];
    expect(target).toBeDefined();
    if (!target) return;
    const result = await replayPipeline(target.run_id);
    expect(result.new_run_id).toMatch(/^run-/);
    expect(result.new_run_id).not.toBe(target.run_id);

    const after = await listPipelines();
    expect(after.length).toBe(before.length + 1);
    expect(after[0]?.run_id).toBe(result.new_run_id);
    expect(after[0]?.deck_id).toBe(target.deck_id);
    expect(after[0]?.status).toBe('running');
  });

  it('replayPipeline falls back to seed-generated id on upstream error', async () => {
    mockFetch({}, { ok: false, status: 500 });
    const result = await replayPipeline('run-2026-08-13-001');
    expect(result.new_run_id).toMatch(/^run-/);
  });

  it('replayPipeline falls back to default deck when run_id is unknown', async () => {
    mockFetch({}, { ok: false, status: 500 });
    const result = await replayPipeline('run-unknown');
    expect(result.new_run_id).toMatch(/^run-/);
    const after = await listPipelines();
    const replay = after.find((p) => p.run_id === result.new_run_id);
    expect(replay).toBeDefined();
    expect(replay?.deck_id).toBe('deck-replay');
  });

  it('does not mutate node arrays when fetching detail', async () => {
    const list = await listPipelines();
    const target = list[0];
    if (!target) return;
    const detail = await getPipeline(target.run_id);
    expect(detail).not.toBeNull();
    // Mutating returned detail must not affect the next list call.
    if (detail && detail.nodes[0]) {
      detail.nodes[0] = { ...detail.nodes[0], name: 'mutated' };
    }
    const listAgain = await listPipelines();
    const fresh = listAgain.find((p) => p.run_id === target.run_id);
    expect(fresh?.nodes[0]?.name).not.toBe('mutated');
  });

  it('running pipeline surfaces a running node and an idle downstream node', async () => {
    const list = await listPipelines();
    const running = list.find((p) => p.status === 'running');
    expect(running).toBeDefined();
    if (!running) return;
    const runningNodes = running.nodes.filter((n) => n.status === 'running');
    expect(runningNodes.length).toBeGreaterThanOrEqual(1);
    const idleNodes = running.nodes.filter((n) => n.status === 'idle');
    expect(idleNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('errored pipeline surfaces an error node with a message', async () => {
    const list = await listPipelines();
    const err = list.find((p) => p.status === 'error');
    expect(err).toBeDefined();
    if (!err) return;
    const errorNodes = err.nodes.filter((n) => n.status === 'error');
    expect(errorNodes.length).toBeGreaterThanOrEqual(1);
    expect(errorNodes[0]?.error).toMatch(/.+/);
  });
});
