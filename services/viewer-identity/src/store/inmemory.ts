/**
 * Viewer-identity — in-memory store for tests + dev mode.
 *
 * Production uses the Postgres store (see store/postgres.ts), but the
 * shape of the store interface is the same so tests can swap it. The
 * in-memory store is also what makes the cross-device stitching
 * unit tests fast — a SQL roundtrip per iteration would be silly.
 */

import { randomUUID } from 'node:crypto';
import type { ViewerRecord, IdentityLink, ConsentEvent } from '../types.js';

export interface IdentityStore {
  upsertViewer(v: ViewerRecord): Promise<ViewerRecord>;
  getViewerByKey(workspace_id: string, viewer_id_key: string): Promise<ViewerRecord | null>;
  getViewerById(viewer_id: string): Promise<ViewerRecord | null>;
  /** Return all viewers in a workspace whose last_seen_at >= since. */
  recentViewers(workspace_id: string, since_ms: number, limit: number): Promise<ViewerRecord[]>;
  insertLink(l: IdentityLink): Promise<IdentityLink>;
  listLinksFor(viewer_id: string): Promise<IdentityLink[]>;
  insertConsent(e: ConsentEvent): Promise<ConsentEvent>;
  recentConsentFor(
    viewer_id: string,
    mode: ConsentEvent['privacy_mode'],
  ): Promise<ConsentEvent | null>;
  /** GDPR: erase all rows for a viewer. Returns the count of rows removed. */
  eraseViewer(viewer_id: string): Promise<number>;
  /** GDPR: dump every row that mentions this viewer. */
  exportViewer(viewer_id: string): Promise<{
    viewers: ViewerRecord[];
    links: IdentityLink[];
    consent: ConsentEvent[];
  }>;
}

export function buildInMemoryStore(): IdentityStore {
  const viewers = new Map<string, ViewerRecord>(); // by viewer_id
  const byKey = new Map<string, string>(); // workspace_id|viewer_id_key → viewer_id
  const links: IdentityLink[] = [];
  const consent: ConsentEvent[] = [];

  function key(workspace_id: string, viewer_id_key: string): string {
    return `${workspace_id}|${viewer_id_key}`;
  }

  return {
    async upsertViewer(v) {
      const existing = byKey.get(key(v.workspace_id, v.viewer_id_key));
      if (existing) {
        const stored = viewers.get(existing)!;
        const updated: ViewerRecord = {
          ...stored,
          last_seen_at: v.last_seen_at,
          metadata: { ...stored.metadata, ...v.metadata },
          // privacy_mode: take the LEAST identifying of stored vs
          // incoming. Ordering (low → high):
          //   anon_no_track < anon_consent < pseudonymous < identified
          // This honours GDPR right-to-object (anon_no_track always
          // wins) and ensures a viewer can never become more
          // identifying without an explicit consent grant.
          privacy_mode: leastIdentifying(stored.privacy_mode, v.privacy_mode),
          region_pinned: v.region_pinned ?? stored.region_pinned,
        };
        viewers.set(stored.viewer_id, updated);
        return updated;
      }
      const fresh: ViewerRecord = {
        ...v,
        viewer_id: v.viewer_id || randomUUID(),
      };
      viewers.set(fresh.viewer_id, fresh);
      byKey.set(key(v.workspace_id, v.viewer_id_key), fresh.viewer_id);
      return fresh;
    },

    async getViewerByKey(workspace_id, viewer_id_key) {
      const id = byKey.get(key(workspace_id, viewer_id_key));
      if (!id) return null;
      return viewers.get(id) ?? null;
    },

    async getViewerById(viewer_id) {
      return viewers.get(viewer_id) ?? null;
    },

    async recentViewers(workspace_id, since_ms, limit) {
      const out: ViewerRecord[] = [];
      for (const v of viewers.values()) {
        if (v.workspace_id !== workspace_id) continue;
        if (v.last_seen_at < since_ms) continue;
        out.push(v);
        if (out.length >= limit) break;
      }
      return out;
    },

    async insertLink(l) {
      // Block (canonical, alternate) duplicates.
      const dupe = links.find(
        (x) => x.canonical_id === l.canonical_id && x.alternate_id === l.alternate_id,
      );
      if (dupe) return dupe;
      const stored: IdentityLink = {
        ...l,
        link_id: l.link_id || randomUUID(),
      };
      links.push(stored);
      return stored;
    },

    async listLinksFor(viewer_id) {
      return links.filter((l) => l.canonical_id === viewer_id || l.alternate_id === viewer_id);
    },

    async insertConsent(e) {
      const stored: ConsentEvent = {
        ...e,
        event_id: e.event_id || randomUUID(),
      };
      consent.push(stored);
      return stored;
    },

    async recentConsentFor(viewer_id, mode) {
      let best: ConsentEvent | null = null;
      for (const c of consent) {
        if (c.viewer_id !== viewer_id) continue;
        if (c.privacy_mode !== mode) continue;
        if (!best || c.occurred_at > best.occurred_at) best = c;
      }
      return best;
    },

    async eraseViewer(viewer_id) {
      let n = 0;
      const v = viewers.get(viewer_id);
      if (v) {
        viewers.delete(viewer_id);
        byKey.delete(key(v.workspace_id, v.viewer_id_key));
        n += 1;
      }
      for (let i = links.length - 1; i >= 0; i -= 1) {
        const l = links[i]!;
        if (l.canonical_id === viewer_id || l.alternate_id === viewer_id) {
          links.splice(i, 1);
          n += 1;
        }
      }
      for (let i = consent.length - 1; i >= 0; i -= 1) {
        if (consent[i]!.viewer_id === viewer_id) {
          consent.splice(i, 1);
          n += 1;
        }
      }
      return n;
    },

    async exportViewer(viewer_id) {
      const v = viewers.get(viewer_id) ?? null;
      const ls = links.filter((l) => l.canonical_id === viewer_id || l.alternate_id === viewer_id);
      const cs = consent.filter((c) => c.viewer_id === viewer_id);
      return {
        viewers: v ? [v] : [],
        links: ls,
        consent: cs,
      };
    },
  };
}

/**
 * Return the privacy mode that is LEAST identifying of the two.
 * Ordering (low → high): anon_no_track < anon_consent < pseudonymous < identified.
 *
 * This means a viewer that was ever downgraded to anon_no_track
 * (e.g. via GDPR right-to-object) stays there forever; only an
 * explicit consent grant at a higher tier can re-promote.
 */
export function leastIdentifying(
  a: ViewerRecord['privacy_mode'],
  b: ViewerRecord['privacy_mode'],
): ViewerRecord['privacy_mode'] {
  const order: Record<ViewerRecord['privacy_mode'], number> = {
    anon_no_track: 0,
    anon_consent: 1,
    pseudonymous: 2,
    identified: 3,
  };
  return order[a] <= order[b] ? a : b;
}
