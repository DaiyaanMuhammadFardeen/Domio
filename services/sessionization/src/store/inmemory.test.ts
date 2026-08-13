import { describe, it, expect } from 'vitest';
import { buildInMemoryStore } from './inmemory.js';
import type { SessionRecord } from '../types.js';

function session(opts: Partial<SessionRecord>): SessionRecord {
  return {
    session_id: 's1',
    workspace_id: 'ws-1',
    viewer_id_key: 'vk-1',
    deck_id: 'd1',
    state: 'open',
    started_at_ms: 1_000,
    last_event_at_ms: 1_000,
    ended_at_ms: null,
    event_count: 1,
    source_app: 'viewer',
    privacy_mode: 'pseudonymous',
    device_class: 'desktop',
    region_pinned: null,
    country_iso: null,
    ...opts,
  };
}

describe('InMemorySessionStore', () => {
  it('upserts and retrieves a session', async () => {
    const store = buildInMemoryStore();
    const s = await store.upsertSession(session({ session_id: 's1' }));
    expect(s.session_id).toBe('s1');
    const got = await store.getSession('ws-1', 's1');
    expect(got?.session_id).toBe('s1');
  });

  it('closes a session', async () => {
    const store = buildInMemoryStore();
    await store.upsertSession(session({}));
    const closed = await store.closeSession('ws-1', 's1', 5_000);
    expect(closed?.state).toBe('closed');
    expect(closed?.ended_at_ms).toBe(5_000);
  });

  it('returns null when closing a missing session', async () => {
    const store = buildInMemoryStore();
    const out = await store.closeSession('ws-1', 'missing', 1_000);
    expect(out).toBeNull();
  });

  it('recentOpen filters by workspace and state', async () => {
    const store = buildInMemoryStore();
    await store.upsertSession(
      session({ session_id: 'open-1', workspace_id: 'ws-1', viewer_id_key: 'vk-1' }),
    );
    await store.upsertSession(
      session({
        session_id: 'closed-1',
        workspace_id: 'ws-1',
        viewer_id_key: 'vk-1',
        state: 'closed',
        ended_at_ms: 5_000,
      }),
    );
    await store.upsertSession(
      session({ session_id: 'other-ws', workspace_id: 'ws-2', viewer_id_key: 'vk-1' }),
    );
    const open = await store.recentOpen('ws-1', 'vk-1');
    expect(open.map((s) => s.session_id)).toEqual(['open-1']);
  });

  it('listByWorkspace filters by since_ms', async () => {
    const store = buildInMemoryStore();
    await store.upsertSession(session({ session_id: 'old', last_event_at_ms: 100 }));
    await store.upsertSession(session({ session_id: 'new', last_event_at_ms: 1_000 }));
    const out = await store.listByWorkspace('ws-1', 500, 10);
    expect(out.map((s) => s.session_id)).toEqual(['new']);
  });
});
