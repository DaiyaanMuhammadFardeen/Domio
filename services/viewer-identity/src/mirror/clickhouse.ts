/**
 * Viewer-identity — ClickHouse mirror writer (Phase 17 W3).
 *
 * The identity graph remains authoritative in Postgres. This writer mirrors
 * privacy-safe identity snapshots and consent changes to ClickHouse for fast
 * analytics lookups. It is dependency-injected so the service can run without
 * ClickHouse in tests and local fallback mode.
 */

import type { ConsentEvent, ViewerRecord } from '../types.js';

export interface IdentityMirrorClient {
  execute(sql: string, params?: Record<string, unknown>): Promise<void>;
}

export interface IdentityMirror {
  writeViewer(viewer: ViewerRecord): Promise<void>;
  writeConsent(event: ConsentEvent): Promise<void>;
  eraseViewer(workspaceId: string, viewerIdKey: string): Promise<void>;
}

export function buildIdentityMirror(client: IdentityMirrorClient): IdentityMirror {
  return {
    async writeViewer(viewer) {
      await client.execute(
        `INSERT INTO viewer_identity_long
          (viewer_id, workspace_id, viewer_id_key, privacy_mode, region_pinned, canonical_id, created_at, last_seen_at)
         VALUES ({viewer_id:String}, {workspace_id:String}, {viewer_id_key:String}, {privacy_mode:String}, {region_pinned:Nullable(String)}, {canonical_id:Nullable(String)}, {created_at:DateTime64(3)}, {last_seen_at:DateTime64(3)})`,
        {
          viewer_id: viewer.viewer_id,
          workspace_id: viewer.workspace_id,
          viewer_id_key: viewer.viewer_id_key,
          privacy_mode: viewer.privacy_mode,
          region_pinned: viewer.region_pinned,
          canonical_id: viewer.canonical_id,
          created_at: toDateTime64(viewer.created_at),
          last_seen_at: toDateTime64(viewer.last_seen_at),
        },
      );
    },

    async writeConsent(event) {
      await client.execute(
        `INSERT INTO consent_events
          (event_id, viewer_id, workspace_id, viewer_id_key, ts, action, privacy_mode, source)
         VALUES ({event_id:String}, {viewer_id:String}, {workspace_id:String}, {viewer_id_key:String}, {ts:DateTime64(3)}, {action:String}, {privacy_mode:String}, {source:String})`,
        {
          event_id: event.event_id,
          viewer_id: event.viewer_id,
          workspace_id: event.workspace_id,
          // viewer_id_key is intentionally blank: consent events do not
          // carry raw identifiers and callers may enrich this separately.
          viewer_id_key: '',
          ts: toDateTime64(event.occurred_at),
          action: event.action === 'grant' ? 'granted' : 'withdrawn',
          privacy_mode: event.privacy_mode,
          source: event.source,
        },
      );
    },

    async eraseViewer(workspaceId, viewerIdKey) {
      await client.execute(
        `INSERT INTO viewer_tombstone (workspace_id, viewer_id_key, erased_at, reason)
         VALUES ({workspace_id:String}, {viewer_id_key:String}, {erased_at:DateTime64(3)}, {reason:String})`,
        {
          workspace_id: workspaceId,
          viewer_id_key: viewerIdKey,
          erased_at: toDateTime64(Date.now()),
          reason: 'gdpr_erasure',
        },
      );
      await client.execute(
        `ALTER TABLE viewer_identity_long DELETE WHERE workspace_id = {workspace_id:String} AND viewer_id_key = {viewer_id_key:String}`,
        { workspace_id: workspaceId, viewer_id_key: viewerIdKey },
      );
    },
  };
}

/** ClickHouse DateTime64 parameters accept ISO timestamps over HTTP. */
function toDateTime64(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}
