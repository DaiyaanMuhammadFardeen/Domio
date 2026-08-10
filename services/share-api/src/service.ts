/**
 * Share-link service (Phase 14 W1).
 *
 * Transport-agnostic orchestration of share-link lifecycle:
 *   create → read → update → rotateToken → extendExpiry → revoke.
 *
 * The service depends on three things:
 *  - {@link ShareStore}       — persistence (in-memory or pgx).
 *  - {@link AuditEmitter}     — hash-chained audit log emission.
 *  - `tokenMinter`            — mint/verify signed link tokens.
 *
 * Capabilities (share:*):
 *  - share:create    — POST /v1/shares
 *  - share:read      — GET /v1/shares/{id}
 *  - share:update    — PATCH /v1/shares/{id}
 *  - share:delete    — DELETE /v1/shares/{id}
 *  - share:rotate    — POST /v1/shares/{id}/rotate-token
 *  - share:policy    — GET/PUT /v1/shares/{id}/policy
 *
 * Public API:
 *  - {@link ShareService} — the service.
 *  - {@link ShareServiceOptions} — constructor options.
 */

import type {
  ViewerClaims} from '@domio/signed-link-token';
import {
  mintLinkToken,
  mintShortId,
  type NonceStore,
} from '@domio/signed-link-token';
import { createHash } from 'crypto';
import type {
  CreateShareInput,
  ExtendExpiryInput,
  LinkPolicy,
  ShareApprovalGate,
  ShareLink,
  UpdateShareInput,
} from './types.js';
import {
  AllowAllApprovalGate,
  ShareApprovalRequiredError,
  ShareNotFoundError,
  ShareRevokedError,
  ShareValidationError,
  validateCreateInput,
  validateExtendExpiry,
  validateUpdateInput,
} from './types.js';
import type {
  ShareLinkSnapshot,
  ShareStore} from './store/store.js';
import {
  isStore,
} from './store/store.js';
import type {
  AuditEmitter,
  ShareAuditAction,
  ShareAuditEvent,
} from './audit/emit.js';
import { shareAuditKey } from './audit/key.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface ShareServiceOptions {
  readonly store: ShareStore;
  readonly audit: AuditEmitter;
  /** HMAC-SHA256 key used to sign link tokens. Must be >= 32 bytes raw
   *  (or 64 hex chars). Required. */
  readonly tokenKey: Uint8Array;
  /** Optional nonce store for replay protection. */
  readonly nonceStore?: NonceStore;
  /** Caller-provided short-id generator (deterministic in tests). */
  readonly shortIdGenerator?: () => string;
  /** Caller-provided ULID/link-id generator. */
  readonly idGenerator?: () => string;
  /** Caller-provided policy-id generator. */
  readonly policyIdGenerator?: () => string;
  /** Clock. Default `Date.now`. */
  readonly clock?: () => Date;
  /**
   * Optional pluggable approval gate (Phase 18 #180).
   * When set, `createShare` and `introspect` are gated — if the gate
   * denies, `ShareApprovalRequiredError` is thrown (→ 403 in handlers).
   * Default: {@link AllowAllApprovalGate} (no-op, preserves backward
   * compatibility).
   */
  readonly approvalGate?: ShareApprovalGate;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ShareService {
  private readonly store: ShareStore;
  private readonly audit: AuditEmitter;
  private readonly tokenKey: Uint8Array;
  private readonly nonceStore: NonceStore | undefined;
  private readonly shortIdGen: () => string;
  private readonly idGen: () => string;
  private readonly policyIdGen: () => string;
  private readonly clock: () => Date;
  private readonly approvalGate: ShareApprovalGate;

  constructor(opts: ShareServiceOptions) {
    if (!isStore(opts.store)) {
      throw new Error('ShareService: store is required');
    }
    if (!opts.audit) {
      throw new Error('ShareService: audit emitter is required');
    }
    if (!opts.tokenKey || opts.tokenKey.length < 32) {
      throw new Error('ShareService: tokenKey must be >= 32 bytes');
    }
    this.store = opts.store;
    this.audit = opts.audit;
    this.tokenKey = opts.tokenKey;
    this.nonceStore = opts.nonceStore;
    this.shortIdGen = opts.shortIdGenerator ?? mintShortId;
    this.idGen = opts.idGenerator ?? defaultLinkId;
    this.policyIdGen = opts.policyIdGenerator ?? defaultPolicyId;
    this.clock = opts.clock ?? (() => new Date());
    this.approvalGate = opts.approvalGate ?? AllowAllApprovalGate;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async createShare(input: CreateShareInput): Promise<{ snapshot: ShareLinkSnapshot; token: string }> {
    validateCreateInput(input);

    // Phase 18 #180 — approval gate: consult before creating an external share link.
    const approved = await this.approvalGate.isShareApproved(input.workspaceId, input.deckId);
    if (!approved) {
      throw new ShareApprovalRequiredError(input.workspaceId, input.deckId);
    }

    // Generate a short id; retry up to 5 times on collision.
    let shortId = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      shortId = this.shortIdGen();
      if (!(await this.store.shortIdExists(input.workspaceId, shortId))) break;
      if (attempt === 4) {
        throw new ShareValidationError('failed to mint a unique short id after 5 attempts');
      }
    }

    const linkId = this.idGen();
    const policyId = this.policyIdGen();
    const now = this.clock();

    const link: ShareLink = {
      id: linkId,
      workspaceId: input.workspaceId,
      deckId: input.deckId,
      shortId,
      slug: input.slug ?? null,
      tokenHash: null,
      status: 'active',
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      revokedBy: null,
      watermarkProfileId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId,
      updatedBy: null,
    };

    const policy: LinkPolicy = {
      id: policyId,
      workspaceId: input.workspaceId,
      shareLinkId: linkId,
      visibility: input.visibility ?? 'link_only',
      allowedViewers: input.allowedViewers ?? [],
      maxViews: input.maxViews ?? null,
      viewCount: 0,
      allowDownload: input.allowDownload ?? false,
      allowPrint: input.allowPrint ?? false,
      allowEmbed: input.allowEmbed ?? true,
      requirePasscode: input.requirePasscode ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.insert(input, link, policy);

    // Mint a token. If `expiresAt` is null, use a far-future default (1y).
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const claims: ViewerClaims = {
      workspace_id: input.workspaceId,
      link_id: linkId,
      short_id: shortId,
      iss: 'domio:share-api',
    };
    const token = await mintLinkToken(
      { claims, expiresAt },
      this.tokenKey,
    );
    const tokenHash = sha256Hex(token);

    // Persist the token hash by issuing a rotateToken-style update.
    // The post-insert seq is 1, so we pass expectedSeq=1 to bump to 2.
    const stored = await this.store.rotateToken(
      input.workspaceId,
      linkId,
      tokenHash,
      input.actorId,
      1,
    );

    // emit audit event AFTER all writes succeed.
    await this.emitShareAction({
      workspaceId: input.workspaceId,
      action: 'share.created',
      actorId: input.actorId,
      linkId,
      ts: now,
      before: null,
      after: stored,
    });

    return { snapshot: stored, token };
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async getShare(workspaceId: string, linkId: string): Promise<ShareLinkSnapshot> {
    const snap = await this.store.findById(workspaceId, linkId);
    if (!snap) throw new ShareNotFoundError(linkId);
    return snap;
  }

  async getSharePolicy(workspaceId: string, linkId: string): Promise<LinkPolicy> {
    const snap = await this.getShare(workspaceId, linkId);
    return snap.policy;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async updateShare(
    workspaceId: string,
    linkId: string,
    patch: UpdateShareInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    validateUpdateInput(patch);
    const before = await this.getShare(workspaceId, linkId);
    const after = await this.store.update(workspaceId, linkId, patch, expectedSeq);

    // Detect policy-only vs full updates. If patch has visibility / allowedViewers
    // / any policy field, emit share.policy_changed. Otherwise emit share.updated.
    const policyChanged = patch.visibility !== undefined
      || patch.allowedViewers !== undefined
      || patch.maxViews !== undefined
      || patch.allowDownload !== undefined
      || patch.allowPrint !== undefined
      || patch.allowEmbed !== undefined
      || patch.requirePasscode !== undefined;
    const action: ShareAuditAction = policyChanged ? 'share.policy_changed' : 'share.updated';

    await this.emitShareAction({
      workspaceId,
      action,
      actorId: patch.actorId,
      linkId,
      ts: this.clock(),
      before,
      after,
    });

    return after;
  }

  // -------------------------------------------------------------------------
  // Extend expiry
  // -------------------------------------------------------------------------

  async extendExpiry(
    workspaceId: string,
    linkId: string,
    input: ExtendExpiryInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    validateExtendExpiry(input, this.clock());
    const before = await this.getShare(workspaceId, linkId);
    const after = await this.store.extendExpiry(workspaceId, linkId, input, expectedSeq);
    await this.emitShareAction({
      workspaceId,
      action: 'share.expiry_extended',
      actorId: input.actorId,
      linkId,
      ts: this.clock(),
      before,
      after,
    });
    return after;
  }

  // -------------------------------------------------------------------------
  // Rotate token
  // -------------------------------------------------------------------------

  async rotateShareToken(
    workspaceId: string,
    linkId: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<{ snapshot: ShareLinkSnapshot; token: string }> {
    const before = await this.getShare(workspaceId, linkId);
    const claims: ViewerClaims = {
      workspace_id: workspaceId,
      link_id: linkId,
      short_id: before.link.shortId,
      iss: 'domio:share-api',
    };
    const expiresAt = before.link.expiresAt ?? new Date(this.clock().getTime() + 365 * 24 * 60 * 60 * 1000);
    const now = this.clock();
    const token = await mintLinkToken(
      { claims, expiresAt },
      this.tokenKey,
    );
    const tokenHash = sha256Hex(token);
    const after = await this.store.rotateToken(workspaceId, linkId, tokenHash, actorId, expectedSeq);

    await this.emitShareAction({
      workspaceId,
      action: 'share.token_rotated',
      actorId,
      linkId,
      ts: now,
      before,
      after,
    });

    return { snapshot: after, token };
  }

  // -------------------------------------------------------------------------
  // Revoke
  // -------------------------------------------------------------------------

  async revokeShare(
    workspaceId: string,
    linkId: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    const before = await this.getShare(workspaceId, linkId);
    const after = await this.store.revoke(workspaceId, linkId, actorId, expectedSeq);

    await this.emitShareAction({
      workspaceId,
      action: 'share.deleted',
      actorId,
      linkId,
      ts: this.clock(),
      before,
      after,
    });
    return after;
  }

  // -------------------------------------------------------------------------
  // Introspect (token verification — no DB write)
  // -------------------------------------------------------------------------

  async introspect(
    workspaceId: string,
    shortId: string,
    token: string,
  ): Promise<{ claims: ViewerClaims; expiresAtSec: number }> {
    const { verifyLinkToken } = await import('@domio/signed-link-token');
    // 1. Verify the token signature + expiry + nonce.
    const result = await verifyLinkToken(token, this.tokenKey, {
      nonceStore: this.nonceStore,
      clock: () => this.clock().getTime(),
    });
    if (!result.ok) {
      throw new ShareValidationError(`token verify failed: ${result.code} — ${result.message}`);
    }
    // 2. Make sure the short_id encoded in the token matches the requested one.
    if (result.claims.short_id !== shortId) {
      throw new ShareValidationError('token short_id mismatch');
    }
    // 3. Look up the share link and confirm it is not revoked.
    const snap = await this.store.findByShortId(workspaceId, shortId);
    if (!snap) throw new ShareNotFoundError(shortId);
    if (snap.link.status === 'revoked') throw new ShareRevokedError(snap.link.id);

    // Phase 18 #180 — approval gate: consult before delivering content.
    const approved = await this.approvalGate.isShareApproved(workspaceId, snap.link.deckId);
    if (!approved) {
      throw new ShareApprovalRequiredError(workspaceId, snap.link.deckId);
    }

    return { claims: result.claims, expiresAtSec: result.expiresAtSec };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async emitShareAction(
    ev: Omit<ShareAuditEvent, 'agentSessionId' | 'sessionId' | 'toolCallId'>,
  ): Promise<void> {
    await this.audit.emit({
      ...ev,
      agentSessionId: '',
      sessionId: '',
      toolCallId: '',
    });
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

let _defaultLinkCounter = 0;
function defaultLinkId(): string {
  _defaultLinkCounter++;
  return `lnk_${_defaultLinkCounter.toString(36).padStart(6, '0')}`;
}
let _defaultPolicyCounter = 0;
function defaultPolicyId(): string {
  _defaultPolicyCounter++;
  return `pol_${_defaultPolicyCounter.toString(36).padStart(6, '0')}`;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// Re-export the audit key helper for convenience.
export { shareAuditKey };
