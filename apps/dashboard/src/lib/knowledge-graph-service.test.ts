/**
 * knowledge-graph-service — tests for the Wave 11 §S11.15 entity-centric
 * graph API plus the legacy Wave 7 graph fetch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { fetchKnowledgeGraph, getGraph, getEntityReferences } from './knowledge-graph-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('knowledge-graph-service — legacy Wave 7 fetch', () => {
  it('parses claim/slide/citation nodes from /v1/analytics/graph', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        nodes: [
          { id: 'c-1', kind: 'claim', label: 'Q3 revenue grew 24%' },
          { id: 's-1', kind: 'slide', label: 'Slide 1' },
        ],
        edges: [{ from: 'c-1', to: 's-1', kind: 'source_slide' }],
      }),
    })) as unknown as typeof fetch;

    const graph = await fetchKnowledgeGraph('ws-1', {
      baseUrl: 'http://wh.test',
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.claims).toHaveLength(1);
    expect(graph.edges).toHaveLength(1);
  });

  it('returns an empty graph on failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const graph = await fetchKnowledgeGraph('ws-1', { baseUrl: 'http://wh.test' });
    expect(graph).toEqual({ nodes: [], edges: [], claims: [] });
  });
});

describe('knowledge-graph-service — Wave 11 entity graph', () => {
  it('returns seed entities when the warehouse is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const view = await getGraph({ baseUrl: 'http://wh.test' });
    expect(view.entities.length).toBeGreaterThanOrEqual(15);
    expect(view.edges.length).toBeGreaterThanOrEqual(30);
    expect(view.total_entities).toBe(view.entities.length);
    expect(view.total_edges).toBe(view.edges.length);
  });

  it('parses entity + edge wire format when the upstream responds', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        entities: [
          { id: 'ent-x', name: 'Widget Co', type: 'company', reference_count: 4, team: 'sales' },
          { id: 'ent-y', name: 'Widget KPI', type: 'kpi', reference_count: 2, team: 'finance' },
        ],
        edges: [{ from: 'ent-x', to: 'ent-y', weight: 3, relation: 'references' }],
        total_entities: 2,
        total_edges: 1,
      }),
    })) as unknown as typeof fetch;

    const view = await getGraph({ baseUrl: 'http://wh.test' });
    expect(view.entities).toHaveLength(2);
    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]?.relation).toBe('references');
    expect(view.entities.find((e) => e.id === 'ent-x')?.type).toBe('company');
  });

  it('filters entities by team', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const view = await getGraph({
      team: 'sales',
      baseUrl: 'http://wh.test',
    });
    expect(view.entities.every((e) => e.team === 'sales')).toBe(true);
    expect(view.entities.length).toBeGreaterThan(0);
  });

  it('filters entities by type list', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const view = await getGraph({
      entityTypes: ['person', 'company'],
      baseUrl: 'http://wh.test',
    });
    const types = new Set(view.entities.map((e) => e.type));
    expect([...types].every((tt) => tt === 'person' || tt === 'company')).toBe(true);
  });

  it('drops edges that reference filtered-out entities', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const fullView = await getGraph({ baseUrl: 'http://wh.test' });
    const filtered = await getGraph({
      entityTypes: ['kpi'],
      baseUrl: 'http://wh.test',
    });
    // Edges in filtered view must only connect two entities present
    // in the filtered set.
    const ids = new Set(filtered.entities.map((e) => e.id));
    for (const edge of filtered.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
    expect(filtered.edges.length).toBeLessThanOrEqual(fullView.edges.length);
  });

  it('returns deterministic seed references for known entities', async () => {
    const refs = await getEntityReferences('ent-orion');
    expect(refs.length).toBeGreaterThan(0);
    expect(
      refs.every(
        (r) => r.freshness === 'fresh' || r.freshness === 'stale' || r.freshness === 'outdated',
      ),
    ).toBe(true);
    expect(refs.every((r) => typeof r.last_referenced_at_ms === 'number')).toBe(true);
  });

  it('returns deterministic fallback references for unknown entities', async () => {
    const refs = await getEntityReferences('ent-unknown-xyz');
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const slideIds = new Set(refs.map((r) => r.slide_id));
    expect(slideIds.size).toBe(refs.length);
  });

  it('accepts sinceMs without throwing in fallback mode', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const view = await getGraph({
      sinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000,
      baseUrl: 'http://wh.test',
    });
    expect(Array.isArray(view.entities)).toBe(true);
    expect(Array.isArray(view.edges)).toBe(true);
  });
});
