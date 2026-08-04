/**
 * KeyRotator — manages the 30-day rolling rotation of HMAC keys
 * per (tenant, deck) pair.
 *
 * Rotation policy:
 *   - Each (tenant, deck) pair has at most one "active" key and
 *     optionally one "retiring" key inside the 7-day overlap
 *     window.
 *   - `rotate()` issues a new key, marks the previous one as
 *     retiring for `OVERLAP_MS` (7 days), then retires it.
 *   - `signingKey()` returns the active key for encoding.
 *   - `verificationKeys()` returns BOTH active and retiring during
 *     the overlap window so already-issued tokens keep resolving.
 *   - Keys older than `RETIRE_AFTER_MS` (30 + 7 = 37 days from
 *     issue) are no longer accepted.
 */

import { generateKey } from './state-encoder.js';
import { type DeepLinkSigningKey } from './types.js';

/** 30-day active lifetime. */
export const KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 7-day overlap window during which retiring keys still resolve. */
export const OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;
/** Total validity = 30 + 7 = 37 days. */
export const RETIRE_AFTER_MS = KEY_TTL_MS + OVERLAP_MS;

export interface KeyRotationStore {
  /** Persist a newly minted key. */
  insert(record: DeepLinkSigningKey): Promise<void>;
  /** Active key for a (tenant, deck) pair. */
  findActive(tenant_id: string, deck_id: string, now: number): Promise<DeepLinkSigningKey | null>;
  /** All keys valid at `now` for a (tenant, deck) pair (active + retiring). */
  findValid(tenant_id: string, deck_id: string, now: number): Promise<readonly DeepLinkSigningKey[]>;
  /** Mark all keys as retired past their `not_after`. */
  retireExpired(now: number): Promise<number>;
}

/**
 * Compose a `kid` deterministically. Format: `dlk_<deck>_<ULID>`.
 * The ULID suffix gives a sortable, monotonic identifier without
 * exposing the HMAC key bytes.
 */
function newKid(tenant_id: string, deck_id: string, now: number): string {
  // Encode the time + 6 random bytes as base36 — short, sortable, opaque.
  const t = now.toString(36).padStart(9, '0');
  let r = '';
  for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 36).toString(36);
  // Truncate ids to keep kids short.
  const deck = deck_id.slice(-6);
  const tenant = tenant_id.slice(-4);
  return `dlk_${tenant}_${deck}_${t}${r}`;
}

export class KeyRotator {
  private readonly store: KeyRotationStore;
  private readonly clock: () => number;

  constructor(store: KeyRotationStore, opts?: { readonly clock?: () => number }) {
    this.store = store;
    this.clock = opts?.clock ?? (() => Date.now());
  }

  /**
   * Mint a new active key for the given scope. The previous active
   * key (if any) is left valid through the overlap window so
   * already-issued tokens still resolve.
   */
  async rotate(tenant_id: string, deck_id: string): Promise<DeepLinkSigningKey> {
    const now = this.clock();
    const previous = await this.store.findActive(tenant_id, deck_id, now);
    const notBefore = now;
    const notAfter = now + KEY_TTL_MS;
    const kid = newKid(tenant_id, deck_id, now);
    const record: DeepLinkSigningKey = {
      kid,
      secret: generateKey(),
      not_before: notBefore,
      not_after: notAfter,
      tenant_id,
      deck_id,
    };
    await this.store.insert(record);
    // We do not mutate the previous key — it remains valid through
    // `not_after + OVERLAP_MS`. Cleanup happens in `retireExpired`.
    void previous;
    return record;
  }

  /** Returns the active signing key — used by the encoder for new tokens. */
  async signingKey(tenant_id: string, deck_id: string): Promise<DeepLinkSigningKey> {
    const now = this.clock();
    const active = await this.store.findActive(tenant_id, deck_id, now);
    if (active) return active;
    // No active key — issue one on demand. This is the cold-start
    // path; first token for a new deck.
    return this.rotate(tenant_id, deck_id);
  }

  /**
   * Returns every key that may still resolve a token at `now`.
   * The decoder tries each in order; the first that HMAC-verifies
   * wins.
   */
  async verificationKeys(tenant_id: string, deck_id: string): Promise<readonly DeepLinkSigningKey[]> {
    const now = this.clock();
    const all = await this.store.findValid(tenant_id, deck_id, now);
    return all.filter(
      (k) => k.not_before <= now && now <= k.not_after + OVERLAP_MS,
    );
  }

  /** Sweep expired keys; returns the count of retired rows. */
  async sweep(): Promise<number> {
    return this.store.retireExpired(this.clock());
  }
}