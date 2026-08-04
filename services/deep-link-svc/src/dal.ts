/**
 * Deep-link service — persistence layer (Phase 10 M7).
 *
 * Mirrors the `services/prototype-runtime/src/dal.ts` pattern:
 * repository interface + in-memory implementation + Postgres
 * adapter shell. The Postgres adapter is intentionally left as a
 * query-string template (so a future Go migration can reuse it)
 * but the in-memory repo is the one tests cover.
 */

import {
  type DeepLink,
  type DeepLinkPayload,
  type DeepLinkSigningKey,
  type ShortLinkStore,
  type KeyRotationStore,
} from '@domio/deep-link';

// ── Repository interfaces ──────────────────────────────────────────────

export interface DeepLinkRepository extends ShortLinkStore {
  insert(record: DeepLink): Promise<void>;
  findById(id: string): Promise<DeepLink | null>;
  incrementClick(id: string): Promise<DeepLink | null>;
  deleteById(id: string, tenant_id: string): Promise<boolean>;
  listByDeck(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]>;
  /** Returns click count + scope + expiry — used by stats endpoint. */
  getStats(id: string, tenant_id: string): Promise<DeepLinkStats | null>;
}

export interface DeepLinkKeyRepository extends KeyRotationStore {
  insert(record: DeepLinkSigningKey): Promise<void>;
  findActive(tenant_id: string, deck_id: string, now: number): Promise<DeepLinkSigningKey | null>;
  findValid(tenant_id: string, deck_id: string, now: number): Promise<readonly DeepLinkSigningKey[]>;
  retireExpired(now: number): Promise<number>;
}

export interface DeepLinkStats {
  readonly id: string;
  readonly click_count: number;
  readonly expires_at: number;
  readonly viewer_scope: DeepLink['viewer_scope'];
  readonly single_use: boolean;
  readonly created_at: number;
  readonly created_by: string | null;
  readonly tenant_id: string;
  readonly deck_id: string;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class DeepLinkValidationError extends Error {
  readonly code = 'DEEP_LINK_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DeepLinkValidationError';
  }
}

export class DeepLinkAudienceError extends Error {
  readonly code = 'DEEP_LINK_AUDIENCE_MISMATCH' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DeepLinkAudienceError';
  }
}

// ── In-memory implementations ──────────────────────────────────────────

export class InMemoryDeepLinkRepository implements DeepLinkRepository {
  private rows = new Map<string, DeepLink>();

  async insert(record: DeepLink): Promise<void> {
    this.rows.set(record.id, record);
  }

  async findById(id: string): Promise<DeepLink | null> {
    return this.rows.get(id) ?? null;
  }

  async incrementClick(id: string): Promise<DeepLink | null> {
    const cur = this.rows.get(id);
    if (!cur) return null;
    const next: DeepLink = { ...cur, click_count: cur.click_count + 1 };
    this.rows.set(id, next);
    return next;
  }

  async deleteById(id: string, tenant_id: string): Promise<boolean> {
    const cur = this.rows.get(id);
    if (!cur || cur.tenant_id !== tenant_id) return false;
    return this.rows.delete(id);
  }

  async listByDeck(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenant_id === tenant_id && r.deck_id === deck_id)
      .sort((a, b) => b.created_at - a.created_at);
  }

  async getStats(id: string, tenant_id: string): Promise<DeepLinkStats | null> {
    const r = this.rows.get(id);
    if (!r || r.tenant_id !== tenant_id) return null;
    return {
      id: r.id,
      click_count: r.click_count,
      expires_at: r.expires_at,
      viewer_scope: r.viewer_scope,
      single_use: false,
      created_at: r.created_at,
      created_by: r.created_by ?? null,
      tenant_id: r.tenant_id,
      deck_id: r.deck_id,
    };
  }
}

export class InMemoryDeepLinkKeyRepository implements DeepLinkKeyRepository {
  private rows: DeepLinkSigningKey[] = [];

  async insert(record: DeepLinkSigningKey): Promise<void> {
    this.rows.push(record);
  }

  async findActive(tenant_id: string, deck_id: string, now: number): Promise<DeepLinkSigningKey | null> {
    const candidates = this.rows
      .filter((k) => k.tenant_id === tenant_id && k.deck_id === deck_id)
      .filter((k) => k.not_before <= now && now <= k.not_after)
      .sort((a, b) => b.not_before - a.not_before);
    return candidates[0] ?? null;
  }

  async findValid(tenant_id: string, deck_id: string, now: number): Promise<readonly DeepLinkSigningKey[]> {
    return this.rows
      .filter((k) => k.tenant_id === tenant_id && k.deck_id === deck_id)
      .filter((k) => k.not_before <= now && now <= k.not_after + 7 * 24 * 60 * 60 * 1000);
  }

  async retireExpired(now: number): Promise<number> {
    const survivors: DeepLinkSigningKey[] = [];
    let retired = 0;
    for (const r of this.rows) {
      if (r.not_after + 7 * 24 * 60 * 60 * 1000 <= now) {
        retired++;
      } else {
        survivors.push(r);
      }
    }
    this.rows = survivors;
    return retired;
  }
}

// ── Postgres adapter shell (query templates only) ──────────────────────

/**
 * The Postgres adapter is provided as a query-string template so a
 * Go / Rust migration can copy the queries verbatim. It is not
 * executed by the in-process service — the service hands the
 * interface to its DAL and lets the caller plug in a `pg`-based
 * implementation.
 */
export const POSTGRES_QUERIES = {
  insert: `INSERT INTO deep_links (id, tenant_id, deck_id, kid, payload, expires_at, viewer_scope, single_use, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
  findById: `SELECT id, tenant_id, deck_id, kid, payload, click_count, expires_at, viewer_scope, single_use, created_at, created_by
             FROM deep_links WHERE id = $1`,
  incrementClick: `UPDATE deep_links SET click_count = click_count + 1
                   WHERE id = $1
                   RETURNING id, tenant_id, deck_id, kid, payload, click_count, expires_at, viewer_scope, single_use, created_at, created_by`,
  deleteById: `DELETE FROM deep_links WHERE id = $1 AND tenant_id = $2`,
  listByDeck: `SELECT id, tenant_id, deck_id, kid, payload, click_count, expires_at, viewer_scope, single_use, created_at, created_by
               FROM deep_links WHERE tenant_id = $1 AND deck_id = $2
               ORDER BY created_at DESC`,
  insertKey: `INSERT INTO deep_link_keys (kid, tenant_id, deck_id, secret, not_before, not_after)
              VALUES ($1,$2,$3,$4,$5,$6)
              ON CONFLICT (kid) DO NOTHING`,
  findActiveKey: `SELECT kid, tenant_id, deck_id, secret, not_before, not_after
                  FROM deep_link_keys
                  WHERE tenant_id = $1 AND deck_id = $2
                    AND not_before <= $3 AND not_after >= $3
                  ORDER BY not_before DESC LIMIT 1`,
  findValidKeys: `SELECT kid, tenant_id, deck_id, secret, not_before, not_after
                  FROM deep_link_keys
                  WHERE tenant_id = $1 AND deck_id = $2
                    AND not_before <= $3
                    AND not_after + INTERVAL '7 days' >= $3`,
} as const;

export type DeepLinkRecord = DeepLink;
export type DeepLinkPayloadRecord = DeepLinkPayload;