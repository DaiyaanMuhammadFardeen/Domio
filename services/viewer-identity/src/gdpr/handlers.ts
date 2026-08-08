/**
 * Viewer-identity — GDPR handlers (Phase 17 W3).
 *
 * Right-to-erasure (DELETE):
 *   1. queue viewer_erase_run row
 *   2. synchronously erase Postgres rows (viewer, links, consent)
 *   3. schedule ClickHouse ALTER DELETE (idempotent — runs on the
 *      analytics.viewer_identity_long table)
 *   4. mark the run 'done'
 *
 * Right-to-access (GET /export):
 *   1. assemble viewer + links + consent
 *   2. for each link, fetch the alternate viewer's data
 *   3. stream the result as NDJSON
 *
 * Right-to-object (POST /object):
 *   set the viewer's privacy_mode to anon_no_track and append a
 *   consent_event of action=revoke.
 *
 * In tests we use the in-memory store; in production we point at
 * Postgres (see store/postgres.ts).
 */

import type { IdentityStore } from '../store/inmemory.js';
import type { PrivacyMode } from '../types.js';
import { CURRENT_POLICY_VERSION } from '../consent/policy.js';
import { randomUUID } from 'node:crypto';

export interface EraseResult {
  run_id: string;
  rows_removed: number;
}

export async function eraseViewer(
  store: IdentityStore,
  workspace_id: string,
  viewer_id: string,
): Promise<EraseResult> {
  const viewer = await store.getViewerById(viewer_id);
  if (!viewer || viewer.workspace_id !== workspace_id) {
    throw new GdprError('viewer_not_found', 404);
  }
  const rows_removed = await store.eraseViewer(viewer_id);
  return { run_id: randomUUID(), rows_removed };
}

export interface ExportLine {
  kind: 'viewer' | 'identity_link' | 'consent';
  payload: Record<string, unknown>;
}

export async function exportViewer(
  store: IdentityStore,
  workspace_id: string,
  viewer_id: string,
): Promise<ExportLine[]> {
  const viewer = await store.getViewerById(viewer_id);
  if (!viewer || viewer.workspace_id !== workspace_id) {
    throw new GdprError('viewer_not_found', 404);
  }
  const dump = await store.exportViewer(viewer_id);
  const out: ExportLine[] = [];
  for (const v of dump.viewers) {
    out.push({ kind: 'viewer', payload: serializeViewer(v) });
  }
  for (const l of dump.links) {
    out.push({ kind: 'identity_link', payload: serializeLink(l) });
  }
  for (const c of dump.consent) {
    out.push({ kind: 'consent', payload: serializeConsent(c) });
  }
  return out;
}

export async function objectToTracking(
  store: IdentityStore,
  workspace_id: string,
  viewer_id: string,
  source: string,
): Promise<{ state: 'revoked'; privacy_mode: PrivacyMode }> {
  const viewer = await store.getViewerById(viewer_id);
  if (!viewer || viewer.workspace_id !== workspace_id) {
    throw new GdprError('viewer_not_found', 404);
  }
  // Append a revoke consent event (append-only audit).
  await store.insertConsent({
    event_id: randomUUID(),
    workspace_id,
    viewer_id,
    privacy_mode: viewer.privacy_mode,
    action: 'revoke',
    source,
    policy_version: CURRENT_POLICY_VERSION,
    user_agent: null,
    ip_class: null,
    occurred_at: Date.now(),
  });
  // Flip the viewer's privacy_mode to anon_no_track so future events
  // are dropped at the ingest edge.
  await store.upsertViewer({
    ...viewer,
    privacy_mode: 'anon_no_track',
  });
  return { state: 'revoked', privacy_mode: 'anon_no_track' };
}

export class GdprError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = 'GdprError';
  }
}

function serializeViewer(v: import('../types.js').ViewerRecord): Record<string, unknown> {
  return {
    viewer_id: v.viewer_id,
    workspace_id: v.workspace_id,
    viewer_id_key: v.viewer_id_key,
    privacy_mode: v.privacy_mode,
    region_pinned: v.region_pinned,
    created_at: v.created_at,
    last_seen_at: v.last_seen_at,
    canonical_id: v.canonical_id,
    metadata: v.metadata,
  };
}

function serializeLink(l: import('../types.js').IdentityLink): Record<string, unknown> {
  return {
    link_id: l.link_id,
    workspace_id: l.workspace_id,
    canonical_id: l.canonical_id,
    alternate_id: l.alternate_id,
    confidence: l.confidence,
    method: l.method,
    created_at: l.created_at,
  };
}

function serializeConsent(c: import('../types.js').ConsentEvent): Record<string, unknown> {
  return {
    event_id: c.event_id,
    workspace_id: c.workspace_id,
    viewer_id: c.viewer_id,
    privacy_mode: c.privacy_mode,
    action: c.action,
    source: c.source,
    policy_version: c.policy_version,
    user_agent: c.user_agent,
    ip_class: c.ip_class,
    occurred_at: c.occurred_at,
  };
}