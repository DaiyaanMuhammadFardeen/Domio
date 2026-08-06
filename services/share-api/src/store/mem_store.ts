/**
 * In-memory share-link store (Phase 14 W1).
 *
 * Backs every method of {@link ShareStore} with a Map. Used in unit
 * tests and in dev when DATABASE_URL is unset. The interface mirrors
 * what the pgx-backed implementation will offer once the migration is
 * applied against a live Postgres.
 */

import type {
  CreateShareInput,
  ExtendExpiryInput,
  LinkPolicy,
  ShareLink,
  UpdateShareInput,
} from '../types.js';
import {
  ShareNotFoundError,
  ShareConflictError,
  validateCreateInput,
  validateExtendExpiry,
  validateUpdateInput,
} from '../types.js';
import {
  ConcurrentModificationError,
  ShortIdCollisionError,
  type ShareLinkSnapshot,
  type ShareStore,
} from './store.js';

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface InternalRecord {
  link: ShareLink;
  policy: LinkPolicy;
  /** Monotonic per-record seq for optimistic concurrency. */
  seq: number;
}

export interface InMemoryShareStoreOptions {
  /** Caller-provided id generator. Default: monotonic counter. */
  readonly idGenerator?: () => string;
  /** Clock. Default `Date.now`. */
  readonly clock?: () => Date;
}

export class InMemoryShareStore implements ShareStore {
  /** workspace_id → link_id → record. */
  private readonly byLinkId = new Map<string, Map<string, InternalRecord>>();
  /** workspace_id → short_id → link_id (for fast uniqueness). */
  private readonly shortIdIndex = new Map<string, Map<string, string>>();
  /** workspace_id → slug → link_id (nullable; many rows may have NULL slug). */
  private readonly slugIndex = new Map<string, Map<string, string>>();
  private readonly clock: () => Date;

  constructor(opts: InMemoryShareStoreOptions = {}) {
    // The idGenerator option is accepted for API symmetry with future
    // W2 hooks, but the in-memory store currently derives link ids
    // from the input itself, so the generator is intentionally unused.
    void opts.idGenerator;
    this.clock = opts.clock ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findById(workspaceId: string, linkId: string): Promise<ShareLinkSnapshot | null> {
    const ws = this.byLinkId.get(workspaceId);
    if (!ws) return null;
    const rec = ws.get(linkId);
    if (!rec) return null;
    if (rec.link.status === 'revoked') return null;
    return { link: rec.link, policy: rec.policy };
  }

  async findByShortId(workspaceId: string, shortId: string): Promise<ShareLinkSnapshot | null> {
    const ws = this.shortIdIndex.get(workspaceId);
    if (!ws) return null;
    const linkId = ws.get(shortId);
    if (!linkId) return null;
    return this.findById(workspaceId, linkId);
  }

  async findBySlug(workspaceId: string, slug: string): Promise<ShareLinkSnapshot | null> {
    const ws = this.slugIndex.get(workspaceId);
    if (!ws) return null;
    const linkId = ws.get(slug);
    if (!linkId) return null;
    return this.findById(workspaceId, linkId);
  }

  async shortIdExists(workspaceId: string, shortId: string): Promise<boolean> {
    const linkId = this.shortIdIndex.get(workspaceId)?.get(shortId);
    if (!linkId) return false;
    // Even if the row exists, treat revoked short-ids as not-existing
    // so the create-path can recycle them.
    const rec = this.byLinkId.get(workspaceId)?.get(linkId);
    if (!rec) return false;
    return rec.link.status !== 'revoked';
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  async insert(input: CreateShareInput, link: ShareLink, policy: LinkPolicy): Promise<void> {
    validateCreateInput(input);
    if (await this.shortIdExists(input.workspaceId, link.shortId)) {
      throw new ShortIdCollisionError(link.shortId);
    }
    if (input.slug) {
      const slugMap = this.slugIndex.get(input.workspaceId) ?? new Map<string, string>();
      if (slugMap.has(input.slug)) {
        throw new ShareConflictError(`slug already exists: ${input.slug}`, 'SLUG_TAKEN');
      }
    }

    let wsLinks = this.byLinkId.get(input.workspaceId);
    if (!wsLinks) {
      wsLinks = new Map();
      this.byLinkId.set(input.workspaceId, wsLinks);
    }
    wsLinks.set(link.id, { link, policy, seq: 1 });

    let wsShort = this.shortIdIndex.get(input.workspaceId);
    if (!wsShort) {
      wsShort = new Map();
      this.shortIdIndex.set(input.workspaceId, wsShort);
    }
    wsShort.set(link.shortId, link.id);

    if (link.slug) {
      let wsSlug = this.slugIndex.get(input.workspaceId);
      if (!wsSlug) {
        wsSlug = new Map();
        this.slugIndex.set(input.workspaceId, wsSlug);
      }
      wsSlug.set(link.slug, link.id);
    }
  }

  async update(
    workspaceId: string,
    linkId: string,
    patch: UpdateShareInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    validateUpdateInput(patch);
    const rec = this.requireRecord(workspaceId, linkId);
    if (rec.seq !== expectedSeq) throw new ConcurrentModificationError(linkId);
    const now = this.clock();
    const newLink: ShareLink = {
      ...rec.link,
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
      updatedAt: now,
      updatedBy: patch.actorId,
    };
    const newPolicy: LinkPolicy = {
      ...rec.policy,
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.allowedViewers !== undefined ? { allowedViewers: patch.allowedViewers } : {}),
      ...(patch.maxViews !== undefined ? { maxViews: patch.maxViews } : {}),
      ...(patch.allowDownload !== undefined ? { allowDownload: patch.allowDownload } : {}),
      ...(patch.allowPrint !== undefined ? { allowPrint: patch.allowPrint } : {}),
      ...(patch.allowEmbed !== undefined ? { allowEmbed: patch.allowEmbed } : {}),
      ...(patch.requirePasscode !== undefined ? { requirePasscode: patch.requirePasscode } : {}),
      updatedAt: now,
    };
    const updated: InternalRecord = { link: newLink, policy: newPolicy, seq: rec.seq + 1 };
    this.replaceRecord(workspaceId, updated, rec);
    return { link: newLink, policy: newPolicy };
  }

  async extendExpiry(
    workspaceId: string,
    linkId: string,
    input: ExtendExpiryInput,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    validateExtendExpiry(input, this.clock());
    const rec = this.requireRecord(workspaceId, linkId);
    if (rec.seq !== expectedSeq) throw new ConcurrentModificationError(linkId);
    const now = this.clock();
    const newLink: ShareLink = {
      ...rec.link,
      expiresAt: input.expiresAt,
      updatedAt: now,
      updatedBy: input.actorId,
    };
    const updated: InternalRecord = { link: newLink, policy: rec.policy, seq: rec.seq + 1 };
    this.replaceRecord(workspaceId, updated, rec);
    return { link: newLink, policy: rec.policy };
  }

  async rotateToken(
    workspaceId: string,
    linkId: string,
    newTokenHash: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    const rec = this.requireRecord(workspaceId, linkId);
    if (rec.seq !== expectedSeq) throw new ConcurrentModificationError(linkId);
    const now = this.clock();
    const newLink: ShareLink = {
      ...rec.link,
      tokenHash: newTokenHash,
      updatedAt: now,
      updatedBy: actorId,
    };
    const updated: InternalRecord = { link: newLink, policy: rec.policy, seq: rec.seq + 1 };
    this.replaceRecord(workspaceId, updated, rec);
    return { link: newLink, policy: rec.policy };
  }

  async revoke(
    workspaceId: string,
    linkId: string,
    actorId: string,
    expectedSeq: number,
  ): Promise<ShareLinkSnapshot> {
    const rec = this.requireRecord(workspaceId, linkId);
    if (rec.seq !== expectedSeq) throw new ConcurrentModificationError(linkId);
    if (rec.link.status === 'revoked') {
      throw new ShareConflictError('already revoked', 'ALREADY_REVOKED');
    }
    const now = this.clock();
    const newLink: ShareLink = {
      ...rec.link,
      status: 'revoked',
      revokedAt: now,
      revokedBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
    const updated: InternalRecord = { link: newLink, policy: rec.policy, seq: rec.seq + 1 };
    this.replaceRecord(workspaceId, updated, rec);
    return { link: newLink, policy: rec.policy };
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  /** Number of records currently held. */
  size(): number {
    let n = 0;
    for (const ws of this.byLinkId.values()) n += ws.size;
    return n;
  }

  /** Drop everything. */
  clear(): void {
    this.byLinkId.clear();
    this.shortIdIndex.clear();
    this.slugIndex.clear();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private requireRecord(workspaceId: string, linkId: string): InternalRecord {
    const ws = this.byLinkId.get(workspaceId);
    const rec = ws?.get(linkId);
    if (!rec) throw new ShareNotFoundError(linkId);
    return rec;
  }

  private replaceRecord(workspaceId: string, next: InternalRecord, prev: InternalRecord): void {
    const ws = this.byLinkId.get(workspaceId);
    if (!ws) return;
    ws.set(next.link.id, next);
    // If slug changed, re-index.
    if (prev.link.slug !== next.link.slug) {
      const slugMap = this.slugIndex.get(workspaceId);
      if (slugMap) {
        if (prev.link.slug) slugMap.delete(prev.link.slug);
        if (next.link.slug) slugMap.set(next.link.slug, next.link.id);
      }
    }
  }
}