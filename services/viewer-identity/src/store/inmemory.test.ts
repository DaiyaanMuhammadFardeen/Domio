import { describe, it, expect, beforeEach } from 'vitest';
import { buildInMemoryStore } from './inmemory.js';
import type { ViewerRecord } from '../types.js';

function v(overrides: Partial<ViewerRecord> = {}): ViewerRecord {
  return {
    viewer_id: '',
    workspace_id: 'ws-1',
    viewer_id_key: 'k-1',
    privacy_mode: 'pseudonymous',
    region_pinned: null,
    created_at: 0,
    last_seen_at: 0,
    canonical_id: null,
    metadata: {},
    ...overrides,
  };
}

describe('in-memory store', () => {
  let store: ReturnType<typeof buildInMemoryStore>;
  beforeEach(() => {
    store = buildInMemoryStore();
  });

  it('upsert creates a new viewer', async () => {
    const out = await store.upsertViewer(v());
    expect(out.viewer_id.length).toBeGreaterThan(0);
    expect(out.created_at).toBe(0);
  });

  it('upsert is idempotent on (workspace_id, viewer_id_key)', async () => {
    const a = await store.upsertViewer(v());
    const b = await store.upsertViewer(v({ viewer_id_key: 'k-1', last_seen_at: 100 }));
    expect(a.viewer_id).toBe(b.viewer_id);
    expect(b.last_seen_at).toBe(100);
  });

  it('getViewerByKey returns null for unknown keys', async () => {
    expect(await store.getViewerByKey('ws-1', 'k-nope')).toBeNull();
  });

  it('recentViewers filters by workspace + time', async () => {
    await store.upsertViewer(v({ viewer_id_key: 'k-1', last_seen_at: 100 }));
    await store.upsertViewer(v({ viewer_id_key: 'k-2', last_seen_at: 200 }));
    await store.upsertViewer(v({ viewer_id_key: 'k-3', last_seen_at: 300, workspace_id: 'ws-2' }));
    const out = await store.recentViewers('ws-1', 150, 10);
    expect(out.length).toBe(1);
    expect(out[0]?.viewer_id_key).toBe('k-2');
  });

  it('erase removes viewer + linked data', async () => {
    const a = await store.upsertViewer(v());
    const b = await store.upsertViewer(v({ viewer_id_key: 'k-2' }));
    await store.insertLink({
      link_id: '',
      workspace_id: 'ws-1',
      canonical_id: a.viewer_id,
      alternate_id: b.viewer_id,
      confidence: 0.9,
      method: 'email_hash',
      created_at: 0,
    });
    await store.insertConsent({
      event_id: '',
      workspace_id: 'ws-1',
      viewer_id: a.viewer_id,
      privacy_mode: 'pseudonymous',
      action: 'grant',
      source: 'banner',
      policy_version: 'v1',
      user_agent: null,
      ip_class: null,
      occurred_at: 0,
    });
    const n = await store.eraseViewer(a.viewer_id);
    expect(n).toBeGreaterThanOrEqual(3); // viewer + link + consent
    expect(await store.getViewerById(a.viewer_id)).toBeNull();
    expect((await store.listLinksFor(b.viewer_id)).length).toBe(0);
  });

  it('export returns the viewer + their links + consent', async () => {
    const a = await store.upsertViewer(v());
    const b = await store.upsertViewer(v({ viewer_id_key: 'k-2' }));
    await store.insertLink({
      link_id: '',
      workspace_id: 'ws-1',
      canonical_id: a.viewer_id,
      alternate_id: b.viewer_id,
      confidence: 0.9,
      method: 'email_hash',
      created_at: 0,
    });
    const out = await store.exportViewer(a.viewer_id);
    expect(out.viewers.length).toBe(1);
    expect(out.links.length).toBe(1);
    expect(out.consent.length).toBe(0);
  });
});