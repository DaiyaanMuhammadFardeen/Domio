/**
 * Share-link data plane — core types and errors (Phase 14 W1).
 *
 * Models the share_link row + its attached link_policy. The other four
 * tables (link_visibility_rule, watermark_profile, embed_config,
 * seo_metadata) are created in migration 0041 but not yet wired into
 * the W1 API surface; W2–W9 will add their endpoints.
 */

// ---------------------------------------------------------------------------
// Status / visibility
// ---------------------------------------------------------------------------

export type ShareLinkStatus = 'active' | 'revoked' | 'expired';

export type LinkVisibility = 'public' | 'link_only' | 'allowlist' | 'domain_restricted';

// ---------------------------------------------------------------------------
// ShareLink row
// ---------------------------------------------------------------------------

export interface ShareLink {
  readonly id: string;
  readonly workspaceId: string;
  readonly deckId: string;
  readonly shortId: string;
  readonly slug: string | null;
  /** SHA-256 hex of the currently-active signed link token. NULL only
   *  briefly during creation, before mint. */
  readonly tokenHash: string | null;
  readonly status: ShareLinkStatus;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedBy: string | null;
  readonly watermarkProfileId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// LinkPolicy row
// ---------------------------------------------------------------------------

export interface LinkPolicy {
  readonly id: string;
  readonly workspaceId: string;
  readonly shareLinkId: string;
  readonly visibility: LinkVisibility;
  readonly allowedViewers: readonly ViewerTuple[];
  readonly maxViews: number | null;
  readonly viewCount: number;
  readonly allowDownload: boolean;
  readonly allowPrint: boolean;
  readonly allowEmbed: boolean;
  readonly requirePasscode: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ViewerTuple {
  /** "email" | "domain" | "group_id". */
  readonly type: 'email' | 'domain' | 'group_id';
  readonly value: string;
}

// ---------------------------------------------------------------------------
// Create / update inputs
// ---------------------------------------------------------------------------

export interface CreateShareInput {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly actorId: string;
  readonly slug?: string;
  readonly expiresAt?: Date;
  readonly visibility?: LinkVisibility;
  readonly allowedViewers?: readonly ViewerTuple[];
  readonly maxViews?: number;
  readonly allowDownload?: boolean;
  readonly allowPrint?: boolean;
  readonly allowEmbed?: boolean;
  readonly requirePasscode?: boolean;
}

export interface UpdateShareInput {
  readonly actorId: string;
  readonly slug?: string;
  readonly expiresAt?: Date | null;
  readonly visibility?: LinkVisibility;
  readonly allowedViewers?: readonly ViewerTuple[];
  readonly maxViews?: number | null;
  readonly allowDownload?: boolean;
  readonly allowPrint?: boolean;
  readonly allowEmbed?: boolean;
  readonly requirePasscode?: boolean;
}

export interface ExtendExpiryInput {
  readonly actorId: string;
  /** New expiry (absolute). Must be in the future. */
  readonly expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ShareNotFoundError extends Error {
  readonly code = 'SHARE_NOT_FOUND' as const;
  constructor(public readonly linkId: string) {
    super(`Share link not found: ${linkId}`);
    this.name = 'ShareNotFoundError';
  }
}

export class ShareValidationError extends Error {
  readonly code = 'SHARE_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ShareValidationError';
  }
}

export class ShareConflictError extends Error {
  readonly code = 'SHARE_CONFLICT' as const;
  constructor(message: string, public readonly detail?: string) {
    super(message);
    this.name = 'ShareConflictError';
  }
}

export class ShareRevokedError extends Error {
  readonly code = 'SHARE_REVOKED' as const;
  constructor(public readonly linkId: string) {
    super(`Share link is revoked: ${linkId}`);
    this.name = 'ShareRevokedError';
  }
}

// ---------------------------------------------------------------------------
// Approval gate (Phase 18 — Wave 5 #180)
// ---------------------------------------------------------------------------

/**
 * Pluggable gate that the control plane wires in to enforce approval
 * requirements on external share links.  The share-api never imports
 * `@domio/collab` directly — it only knows this interface.
 *
 * The gate is consulted on content-delivery surfaces (createShare,
 * shareIntrospect).  Administrative operations (getShare, updateShare,
 * rotateToken, extendExpiry, revokeShare, getPolicy, putPolicy) are
 * intentionally ungated.
 */
export interface ShareApprovalGate {
  /**
   * Return `true` if the share link is approved for creation / delivery.
   * The `deckId` is provided so the gate can consult the approval engine.
   *
   * @throws any error that should be surfaced (the handler maps
   *   `ShareApprovalRequiredError` → 403; other errors propagate).
   */
  isShareApproved(workspaceId: string, deckId: string): Promise<boolean>;
}

/**
 * Default gate — always allows.  Used when no gate is injected so
 * existing behaviour is preserved (backward-compatible).
 */
export const AllowAllApprovalGate: ShareApprovalGate = {
  async isShareApproved(): Promise<boolean> {
    return true;
  },
};

/**
 * Thrown when a share operation is blocked by the approval gate.
 * The handler layer maps this to a 403 ProblemDetail response.
 */
export class ShareApprovalRequiredError extends Error {
  readonly code = 'SHARE_APPROVAL_REQUIRED' as const;
  constructor(
    public readonly workspaceId: string,
    public readonly deckId: string,
    detail?: string,
  ) {
    super(detail ?? `External share requires approval for deck ${deckId} in workspace ${workspaceId}`);
    this.name = 'ShareApprovalRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_VISIBILITIES: readonly LinkVisibility[] = [
  'public', 'link_only', 'allowlist', 'domain_restricted',
];

export function validateCreateInput(input: CreateShareInput): void {
  if (!input.workspaceId) throw new ShareValidationError('workspaceId is required');
  if (!input.deckId) throw new ShareValidationError('deckId is required');
  if (!input.actorId) throw new ShareValidationError('actorId is required');
  if (input.slug !== undefined) {
    if (typeof input.slug !== 'string') throw new ShareValidationError('slug must be a string');
    if (input.slug.length === 0 || input.slug.length > 64) {
      throw new ShareValidationError('slug must be 1-64 chars');
    }
    if (!/^[a-z0-9-]+$/.test(input.slug)) {
      throw new ShareValidationError('slug must be lowercase alphanumeric + hyphens');
    }
  }
  if (input.visibility !== undefined && !VALID_VISIBILITIES.includes(input.visibility)) {
    throw new ShareValidationError(`invalid visibility: ${input.visibility}`);
  }
  if (input.maxViews !== undefined && input.maxViews !== null && input.maxViews < 1) {
    throw new ShareValidationError('maxViews must be >= 1');
  }
  if (input.expiresAt !== undefined) {
    if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
      throw new ShareValidationError('expiresAt must be a valid Date');
    }
  }
  if (input.allowedViewers !== undefined) {
    for (const v of input.allowedViewers) {
      if (!['email', 'domain', 'group_id'].includes(v.type)) {
        throw new ShareValidationError(`invalid viewer type: ${v.type}`);
      }
      if (!v.value) throw new ShareValidationError('viewer value is required');
    }
  }
}

export function validateUpdateInput(input: UpdateShareInput): void {
  if (!input.actorId) throw new ShareValidationError('actorId is required');
  if (input.visibility !== undefined && !VALID_VISIBILITIES.includes(input.visibility)) {
    throw new ShareValidationError(`invalid visibility: ${input.visibility}`);
  }
}

export function validateExtendExpiry(input: ExtendExpiryInput, now: Date = new Date()): void {
  if (!input.actorId) throw new ShareValidationError('actorId is required');
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    throw new ShareValidationError('expiresAt must be a valid Date');
  }
  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new ShareValidationError('expiresAt must be in the future');
  }
}
