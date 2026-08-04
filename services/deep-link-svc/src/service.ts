/**
 * Deep-link service — business logic (Phase 10 M7).
 *
 * Composes the three classes from `@domio/deep-link` (`StateEncoder`,
 * `Shortener`, `KeyRotator`) into a single service facade that the
 * HTTP handlers call. Adds:
 *   - scope filter application on the encode path (private /
 *     server_only entries are stripped before signing)
 *   - audience mismatch detection on the resolve path
 *   - 30-day key rotation with 7-day overlap
 */

import {
  DEEP_LINK_VERSION,
  StateEncoder,
  StateDecoder,
  Shortener,
  KeyRotator,
  encodePayload,
  decodePayload,
  scopeFilter,
  type DeepLink,
  type DeepLinkPayload,
  type DeepLinkVarEntry,
  type DeepLinkAudience,
  type DeepLinkViewerScope,
  type ShortenInput,
} from '@domio/deep-link';

import {
  NotFoundError,
  DeepLinkAudienceError,
  DeepLinkValidationError,
  type DeepLinkRepository,
  type DeepLinkKeyRepository,
} from './dal.js';

// ── Errors ─────────────────────────────────────────────────────────────

export class DeepLinkResolveError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeepLinkResolveError';
    this.code = code;
  }
}

// ── Input contracts ────────────────────────────────────────────────────

export interface ShortenServiceInput {
  readonly tenant_id: string;
  readonly deck_id: string;
  readonly slide_id: string;
  readonly path_stack?: readonly string[];
  readonly overlay_stack?: readonly string[];
  readonly var_snapshot?: readonly DeepLinkVarEntry[];
  readonly device_frame_state?: Readonly<Record<string, unknown>>;
  readonly scenario?: string;
  readonly form_drafts?: Readonly<Record<string, unknown>>;
  readonly audience?: DeepLinkAudience;
  readonly viewer_scope?: DeepLinkViewerScope;
  readonly single_use?: boolean;
  /** Time-to-live in seconds. Default 30 days. */
  readonly ttl_seconds?: number;
  /** Authoring viewer id (used by scope filter for private vars). */
  readonly authoring_viewer_id?: string;
  readonly created_by?: string;
}

export interface ShortenServiceResult {
  readonly id: string;
  readonly token: string;
  readonly kid: string;
  readonly expires_at: number;
  readonly viewer_scope: DeepLinkViewerScope;
}

export interface ResolveServiceInput {
  readonly tenant_id: string;
  readonly id: string;
  readonly audience: DeepLinkAudience;
  readonly requesting_viewer_id?: string;
}

export interface ResolveServiceResult {
  readonly payload: DeepLinkPayload;
  readonly id: string;
  readonly kid: string;
  readonly click_count: number;
}

// ── Service options ────────────────────────────────────────────────────

export interface DeepLinkServiceOptions {
  readonly repo: DeepLinkRepository;
  readonly keys: DeepLinkKeyRepository;
  readonly clock?: () => number;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

export class DeepLinkService {
  private readonly repo: DeepLinkRepository;
  private readonly keys: DeepLinkKeyRepository;
  private readonly clock: () => number;
  private readonly rotator: KeyRotator;
  private readonly shortener: Shortener;

  constructor(opts: DeepLinkServiceOptions) {
    this.repo = opts.repo;
    this.keys = opts.keys;
    this.clock = opts.clock ?? (() => Date.now());
    this.rotator = new KeyRotator(this.keys, { clock: this.clock });
    this.shortener = new Shortener(this.repo, { clock: this.clock });
  }

  /**
   * Generate a new short link. Steps:
   *   1. Resolve the active signing key (mint one if cold-start).
   *   2. Build the wire payload, run the scope filter, encode + sign.
   *   3. Persist the short-link record (sans signature) and return
   *      the id + token.
   */
  async shorten(input: ShortenServiceInput): Promise<ShortenServiceResult> {
    if (!input.deck_id) throw new DeepLinkValidationError('deck_id is required');
    if (!input.slide_id) throw new DeepLinkValidationError('slide_id is required');
    const now = this.clock();
    const ttl = input.ttl_seconds ?? DEFAULT_TTL_SECONDS;
    if (ttl <= 0) throw new DeepLinkValidationError('ttl_seconds must be > 0');

    const key = await this.rotator.signingKey(input.tenant_id, input.deck_id);
    const encoder = new StateEncoder({ kid: key.kid, key: key.secret });

    const audience: DeepLinkAudience = input.audience ?? 'viewer';
    const viewer_scope: DeepLinkViewerScope = input.viewer_scope ?? 'public';

    // Apply scope filter — strip private / server_only entries
    // before they enter the token.
    const filtered = scopeFilter(input.var_snapshot ?? [], {
      ...(input.authoring_viewer_id !== undefined ? { authoring_viewer_id: input.authoring_viewer_id } : {}),
      ...(input.authoring_viewer_id !== undefined ? { requesting_viewer_id: input.authoring_viewer_id } : {}),
      viewer_scope,
    });

    const wireInput: Omit<DeepLinkPayload, 'sig'> = {
      v: DEEP_LINK_VERSION,
      exp: now + ttl * 1000,
      deck_id: input.deck_id,
      slide_id: input.slide_id,
      path_stack: input.path_stack ?? [],
      overlay_stack: input.overlay_stack ?? [],
      var_snapshot: filtered,
      device_frame_state: input.device_frame_state ?? {},
      scenario: input.scenario ?? '',
      form_drafts: input.form_drafts ?? {},
      aud: audience,
    };
    if (viewer_scope !== 'public' || input.tenant_id) {
      (wireInput as { tenant_id?: string }).tenant_id = input.tenant_id;
    }
    const token = encoder.encode(wireInput);

    const record = await this.shortener.shorten(
      {
        tenant_id: input.tenant_id,
        deck_id: input.deck_id,
        kid: key.kid,
        audience,
        expires_at: now + ttl * 1000,
        viewer_scope,
        ...(input.single_use ? { single_use: input.single_use } : {}),
        ...(input.created_by !== undefined ? { created_by: input.created_by } : {}),
      } satisfies ShortenInput,
      // Persist the unsigned payload (sig is recomputed on resolve
      // by the decoder against the current keyset). The record's
      // payload lives in the DB without `sig` so a DB leak does
      // not hand attackers a usable token.
      { ...wireInput, sig: '' },
    );
    return {
      id: record.id,
      token,
      kid: record.kid,
      expires_at: record.expires_at,
      viewer_scope: record.viewer_scope,
    };
  }

  /**
   * Resolve a short id to its signed payload. Steps:
   *   1. Look up the record, bump click_count (single-use check).
   *   2. Find the key matching `kid`. If retired past overlap,
   *      refuse with an unknown-key error.
   *   3. Decode + verify + enforce audience + enforce expiry.
   */
  async resolve(input: ResolveServiceInput): Promise<ResolveServiceResult> {
    if (!input.id) throw new DeepLinkValidationError('id is required');
    const record = await this.shortener.resolve(input.id);
    if (record.tenant_id !== input.tenant_id) {
      throw new NotFoundError('DeepLink', input.id);
    }
    const keys = await this.rotator.verificationKeys(input.tenant_id, record.deck_id);
    const key = keys.find((k) => k.kid === record.kid);
    if (!key) {
      throw new DeepLinkResolveError('DEEP_LINK_KEY_UNKNOWN', 'Signing key for this link is no longer valid');
    }
    // Reconstruct the signed token from the persisted payload +
    // signing key. We re-sign here so the resolver doesn't need
    // to store the full token verbatim.
    const token = encodePayload(
      {
        v: record.payload.v,
        exp: record.payload.exp,
        deck_id: record.payload.deck_id,
        slide_id: record.payload.slide_id,
        path_stack: record.payload.path_stack,
        overlay_stack: record.payload.overlay_stack,
        var_snapshot: record.payload.var_snapshot,
        device_frame_state: record.payload.device_frame_state,
        scenario: record.payload.scenario,
        form_drafts: record.payload.form_drafts,
        aud: record.payload.aud,
        ...(record.payload.tenant_id !== undefined ? { tenant_id: record.payload.tenant_id } : {}),
      },
      { kid: key.kid, key: key.secret },
    );
    const decoder = new StateDecoder({
      kid: key.kid,
      key: key.secret,
      audience: input.audience,
      now: this.clock(),
    });
    let decoded: DeepLinkPayload;
    try {
      decoded = decoder.decode(token);
    } catch (e) {
      if (e instanceof Error && 'code' in e) {
        throw new DeepLinkResolveError(
          (e as { code: string }).code,
          (e as Error).message,
        );
      }
      throw e;
    }
    if (decoded.aud !== input.audience) {
      throw new DeepLinkAudienceError(
        `Token aud=${decoded.aud} but resolver asked for ${input.audience}`,
      );
    }
    return {
      payload: decoded,
      id: record.id,
      kid: record.kid,
      click_count: record.click_count,
    };
  }

  async stats(tenant_id: string, id: string): Promise<{
    id: string;
    click_count: number;
    expires_at: number;
    viewer_scope: DeepLinkViewerScope;
    single_use: boolean;
    created_at: number;
  }> {
    const s = await this.repo.getStats(id, tenant_id);
    if (!s) throw new NotFoundError('DeepLink', id);
    return {
      id: s.id,
      click_count: s.click_count,
      expires_at: s.expires_at,
      viewer_scope: s.viewer_scope,
      single_use: s.single_use,
      created_at: s.created_at,
    };
  }

  async delete(tenant_id: string, id: string): Promise<boolean> {
    return this.shortener.delete(id, tenant_id);
  }

  async list(tenant_id: string, deck_id: string): Promise<readonly DeepLink[]> {
    return this.shortener.listForDeck(tenant_id, deck_id);
  }

  async rotateKey(tenant_id: string, deck_id: string): Promise<{ kid: string; not_after: number }> {
    const key = await this.rotator.rotate(tenant_id, deck_id);
    return { kid: key.kid, not_after: key.not_after };
  }

  async sweep(): Promise<number> {
    return this.rotator.sweep();
  }
}

// Re-export so handlers can keep imports flat.
export { decodePayload };