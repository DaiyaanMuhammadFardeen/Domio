/**
 * Audit emission for share-link privileged actions (Phase 14 W1).
 *
 * Wraps @domio/audit-ts Chain to record the standard six events:
 *   - share.created
 *   - share.updated
 *   - share.deleted    (revoke)
 *   - share.token_rotated
 *   - share.expiry_extended
 *   - share.policy_changed
 *
 * Every event payload includes {actor_id, link_id, ts, before, after}
 * — the `before` and `after` are full snapshots of the share link +
 * policy rows, so the audit chain is self-describing for forensic
 * replay.
 *
 * Public API:
 *  - `AuditEmitter` — interface (record + list).
 *  - `ChainAuditEmitter` — production: backed by @domio/audit-ts Chain.
 *  - `NoopAuditEmitter` — drop-all for tests.
 *  - `emitShareEvent` — convenience that picks the right event_type.
 */

import type { Event } from '@domio/audit-ts';
import type { Chain } from '@domio/audit-ts';
import type { JsonObject } from '@domio/audit-ts';
import type {
  LinkPolicy,
  ShareLink,
} from '../types.js';
import type { ShareLinkSnapshot } from '../store/store.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AuditEmitter {
  /** Append a share-privileged event to the audit chain. The emitter must
   *  be able to serialize the event so a verifier can replay it later. */
  emit(event: ShareAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

export type ShareAuditAction =
  | 'share.created'
  | 'share.updated'
  | 'share.deleted'
  | 'share.token_rotated'
  | 'share.expiry_extended'
  | 'share.policy_changed';

export interface ShareAuditEvent {
  readonly workspaceId: string;
  readonly agentSessionId: string;
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly action: ShareAuditAction;
  readonly actorId: string;
  readonly linkId: string;
  readonly ts: Date;
  readonly before: ShareLinkSnapshot | null;
  readonly after: ShareLinkSnapshot | null;
}

// ---------------------------------------------------------------------------
// Chain-backed emitter
// ---------------------------------------------------------------------------

export interface ChainAuditEmitterOptions {
  readonly agentSessionId?: string;
  readonly sessionId?: string;
  readonly toolCallId?: string;
}

export class ChainAuditEmitter implements AuditEmitter {
  /** In-memory event log so tests can assert on what was emitted.
   *  Production writes to the agent_audit_event table via the
   *  `commit()` step in the two-phase build/commit pattern. */
  readonly events: Event[] = [];

  constructor(
    private readonly chain: Chain,
    private readonly opts: ChainAuditEmitterOptions = {},
  ) {}

  async emit(event: ShareAuditEvent): Promise<void> {
    const payload: JsonObject = eventToPayload(event);
    const built = await this.chain.build({
      workspaceId: event.workspaceId,
      agentSessionId: this.opts.agentSessionId ?? event.agentSessionId,
      sessionId: this.opts.sessionId ?? event.sessionId,
      toolCallId: this.opts.toolCallId ?? event.toolCallId,
      eventType: event.action,
      payload,
    });
    this.events.push(built);
  }
}

// ---------------------------------------------------------------------------
// Noop emitter
// ---------------------------------------------------------------------------

export class NoopAuditEmitter implements AuditEmitter {
  async emit(_event: ShareAuditEvent): Promise<void> {
    /* drop */
  }
}

// ---------------------------------------------------------------------------
// In-memory emitter (used in audit tests)
// ---------------------------------------------------------------------------

export class InMemoryAuditEmitter implements AuditEmitter {
  readonly events: ShareAuditEvent[] = [];
  async emit(event: ShareAuditEvent): Promise<void> {
    this.events.push(event);
  }
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function eventToPayload(event: ShareAuditEvent): JsonObject {
  return {
    actor_id: event.actorId,
    link_id: event.linkId,
    ts: event.ts.toISOString(),
    before: event.before ? snapshotToJson(event.before) : null,
    after: event.after ? snapshotToJson(event.after) : null,
  };
}

function snapshotToJson(snap: ShareLinkSnapshot): JsonObject {
  return {
    link: linkToJson(snap.link),
    policy: policyToJson(snap.policy),
  };
}

function linkToJson(link: ShareLink): JsonObject {
  return {
    id: link.id,
    workspace_id: link.workspaceId,
    deck_id: link.deckId,
    short_id: link.shortId,
    slug: link.slug,
    token_hash: link.tokenHash,
    status: link.status,
    expires_at: link.expiresAt ? link.expiresAt.toISOString() : null,
    revoked_at: link.revokedAt ? link.revokedAt.toISOString() : null,
    revoked_by: link.revokedBy,
    watermark_profile_id: link.watermarkProfileId,
    created_at: link.createdAt.toISOString(),
    updated_at: link.updatedAt.toISOString(),
    created_by: link.createdBy,
    updated_by: link.updatedBy,
  };
}

function policyToJson(policy: LinkPolicy): JsonObject {
  return {
    id: policy.id,
    workspace_id: policy.workspaceId,
    share_link_id: policy.shareLinkId,
    visibility: policy.visibility,
    allowed_viewers: policy.allowedViewers.map((v) => ({ type: v.type, value: v.value })),
    max_views: policy.maxViews,
    view_count: policy.viewCount,
    allow_download: policy.allowDownload,
    allow_print: policy.allowPrint,
    allow_embed: policy.allowEmbed,
    require_passcode: policy.requirePasscode,
    created_at: policy.createdAt.toISOString(),
    updated_at: policy.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Re-export for downstream convenience
// ---------------------------------------------------------------------------

export type { Event as AuditEvent };
