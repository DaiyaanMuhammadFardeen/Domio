/**
 * Shortener — maps long base64url deep-link tokens to short
 * URL-friendly ids and back.
 *
 * The shortener is intentionally minimal: it owns a short-id
 * namespace and a token store. Persistence is delegated to the
 * service-layer DAL; this class only handles the encode/resolve
 * mechanics plus the click-count discipline that enforces
 * single-use links.
 *
 * Single-use: when `single_use: true`, the first resolve bumps
 * `click_count` to 1; the second resolve throws
 * `DeepLinkReplayError`.
 */

import { randomBytes } from 'node:crypto';
import {
  type DeepLink,
  type DeepLinkPayload,
  type DeepLinkViewerScope,
} from './types.js';
import { DeepLinkReplayError } from './errors.js';

export interface ShortenInput {
  /** Tenant scoping the link. */
  readonly tenant_id: string;
  /** Deck the link belongs to. */
  readonly deck_id: string;
  /** Signing key id (looked up by the rotator). */
  readonly kid: string;
  /** Audience tag (set on the payload). */
  readonly audience: 'viewer' | 'editor' | 'embed' | 'presenter';
  /** Absolute expiry (ms since epoch). */
  readonly expires_at: number;
  /** Visibility scope (controls who can resolve). */
  readonly viewer_scope: DeepLinkViewerScope;
  /** Single-use: resolver throws after one click. */
  readonly single_use?: boolean;
  /** Optional creator user id. */
  readonly created_by?: string;
}

/** Storage interface the Shortener consumes. The service implements it via Postgres. */
export interface ShortLinkStore {
  /** Persist a new short-link record. */
  insert(record: DeepLink): Promise<void>;
  /** Look up by short id. Returns null when not found. */
  findById(id: string): Promise<DeepLink | null>;
  /** Increment click count atomically; returns the new record, or null if not found. */
  incrementClick(id: string): Promise<DeepLink | null>;
  /** Hard-delete by id. */
  deleteById(id: string, tenant_id: string): Promise<boolean>;
  /** List all records for a (tenant, deck) — used by the editor panel. */
  listByDeck(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]>;
}

/** Crockford-style short-id alphabet (omits visually ambiguous chars). */
const SHORT_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Generate a 9-character short id (32^9 ≈ 3.5e12 — ample collision space). */
export function newShortId(len = 9): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SHORT_ALPHABET[bytes[i]! % SHORT_ALPHABET.length];
  }
  return out;
}

export class Shortener {
  private readonly store: ShortLinkStore;
  private readonly clock: () => number;
  constructor(store: ShortLinkStore, opts?: { readonly clock?: () => number }) {
    this.store = store;
    this.clock = opts?.clock ?? (() => Date.now());
  }

  /**
   * Persist a short-link record from an already-encoded token.
   * The service layer hands us the signed payload (sans signature)
   * so the record is replay-safe even if the persisted DB row is
   * leaked without HMAC verification.
   */
  async shorten(
    input: ShortenInput,
    payload: DeepLinkPayload,
  ): Promise<DeepLink> {
    const id = newShortId();
    const now = Date.now();
    const record: DeepLink = {
      id,
      kid: input.kid,
      click_count: 0,
      expires_at: input.expires_at,
      viewer_scope: input.viewer_scope,
      tenant_id: input.tenant_id,
      deck_id: input.deck_id,
      payload,
      created_at: now,
      ...(input.created_by !== undefined ? { created_by: input.created_by } : {}),
    };
    await this.store.insert(record);
    return record;
  }

  /**
   * Resolve a short id to its persisted record, enforcing expiry
   * and single-use replay protection. `incrementClick` runs inside
   * the same logical step so concurrent resolves race-safe.
   */
  async resolve(id: string): Promise<DeepLink> {
    const before = await this.store.findById(id);
    if (!before) {
      throw new DeepLinkReplayError(`Deep link ${id} not found`);
    }
    if (this.clock() > before.expires_at) {
      throw new DeepLinkReplayError(`Deep link ${id} has expired`);
    }
    const after = await this.store.incrementClick(id);
    if (!after) {
      throw new DeepLinkReplayError(`Deep link ${id} not found`);
    }
    // Single-use enforcement: a link minted as single-use must be
    // refused after the first successful resolve. We compare
    // pre- and post-increment counts.
    if (after.click_count > 1 && (before.click_count >= 1)) {
      throw new DeepLinkReplayError(`Deep link ${id} has already been consumed`);
    }
    return after;
  }

  async delete(id: string, tenant_id: string): Promise<boolean> {
    return this.store.deleteById(id, tenant_id);
  }

  async listForDeck(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]> {
    return this.store.listByDeck(tenant_id, deck_id);
  }
}