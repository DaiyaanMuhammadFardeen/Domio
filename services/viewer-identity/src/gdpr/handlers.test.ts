import { describe, it, expect, beforeEach } from 'vitest';
import { eraseViewer, exportViewer, objectToTracking, GdprError } from './handlers.js';
import { buildInMemoryStore } from '../store/inmemory.js';
import type { ViewerRecord } from '../types.js';

function v(over: Partial<ViewerRecord> = {}): ViewerRecord {
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
    ...over,
  };
}

describe('GDPR handlers', () => {
  let store: ReturnType<typeof buildInMemoryStore>;
  beforeEach(() => {
    store = buildInMemoryStore();
  });

  it('eraseViewer removes the viewer and returns rows_removed', async () => {
    const a = await store.upsertViewer(v());
    const out = await eraseViewer(store, 'ws-1', a.viewer_id);
    expect(out.rows_removed).toBeGreaterThanOrEqual(1);
    expect(await store.getViewerById(a.viewer_id)).toBeNull();
  });

  it('eraseViewer rejects cross-workspace id', async () => {
    const a = await store.upsertViewer(v());
    await expect(eraseViewer(store, 'ws-other', a.viewer_id)).rejects.toBeInstanceOf(GdprError);
  });

  it('exportViewer streams viewer + links + consent as NDJSON', async () => {
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
    const lines = await exportViewer(store, 'ws-1', a.viewer_id);
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('viewer');
    expect(kinds).toContain('identity_link');
  });

  it('objectToTracking flips privacy_mode to anon_no_track and writes consent', async () => {
    const a = await store.upsertViewer(v());
    const out = await objectToTracking(store, 'ws-1', a.viewer_id, 'settings');
    expect(out.privacy_mode).toBe('anon_no_track');
    const after = await store.getViewerById(a.viewer_id);
    expect(after?.privacy_mode).toBe('anon_no_track');
    const consent = await store.recentConsentFor(a.viewer_id, 'pseudonymous');
    expect(consent?.action).toBe('revoke');
  });
});