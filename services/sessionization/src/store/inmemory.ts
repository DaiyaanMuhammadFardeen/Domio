/**
 * Sessionization — in-memory store (Phase 17 W4).
 *
 * Production: writes to Postgres `session` table (added by
 * 0059_analytics_core.up.sql) and ClickHouse `sessions_long`.
 * Tests: use this store.
 */

import type { SessionRecord } from '../types.js';

export interface SessionStore {
  upsertSession(s: SessionRecord): Promise<SessionRecord>;
  getSession(workspace_id: string, session_id: string): Promise<SessionRecord | null>;
  recentOpen(workspace_id: string, viewer_id_key: string): Promise<SessionRecord[]>;
  closeSession(workspace_id: string, session_id: string, ended_at_ms: number): Promise<SessionRecord | null>;
  listByWorkspace(workspace_id: string, since_ms: number, limit: number): Promise<SessionRecord[]>;
}

export function buildInMemoryStore(): SessionStore {
  const sessions = new Map<string, SessionRecord>(); // key = workspace_id|session_id

  function key(workspace_id: string, session_id: string): string {
    return `${workspace_id}|${session_id}`;
  }

  return {
    async upsertSession(s) {
      sessions.set(key(s.workspace_id, s.session_id), s);
      return s;
    },
    async getSession(workspace_id, session_id) {
      return sessions.get(key(workspace_id, session_id)) ?? null;
    },
    async recentOpen(workspace_id, viewer_id_key) {
      const out: SessionRecord[] = [];
      for (const s of sessions.values()) {
        if (s.workspace_id !== workspace_id) continue;
        if (s.viewer_id_key !== viewer_id_key) continue;
        if (s.state !== 'open') continue;
        out.push(s);
      }
      return out;
    },
    async closeSession(workspace_id, session_id, ended_at_ms) {
      const k = key(workspace_id, session_id);
      const existing = sessions.get(k);
      if (!existing) return null;
      const updated: SessionRecord = { ...existing, state: 'closed', ended_at_ms };
      sessions.set(k, updated);
      return updated;
    },
    async listByWorkspace(workspace_id, since_ms, limit) {
      const out: SessionRecord[] = [];
      for (const s of sessions.values()) {
        if (s.workspace_id !== workspace_id) continue;
        if (s.last_event_at_ms < since_ms) continue;
        out.push(s);
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}