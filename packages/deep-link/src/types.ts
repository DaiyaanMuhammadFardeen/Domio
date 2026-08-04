/**
 * @domio/deep-link — Type definitions.
 *
 * Phase 10 M7.1 — Deep-link state codec. The token wire shape is
 * a single base64url-encoded JSON object carrying an HMAC-SHA256
 * signature. The codec reuses the runtime VarStore snapshot
 * verbatim (`var_snapshot`) but augments it with the routing
 * metadata (current slide + overlay stack) so a viewer can restore
 * the prototype session exactly.
 */

/** Wire-format version. Bumped on breaking changes to `DeepLinkPayload`. */
export const DEEP_LINK_VERSION = 1 as const;

/** Audience tag the encoder embeds and the decoder enforces. */
export type DeepLinkAudience = 'viewer' | 'editor' | 'embed' | 'presenter';

/** Visibility scope of the link itself (controls who can resolve it). */
export type DeepLinkViewerScope = 'public' | 'tenant' | 'private';

/**
 * Per-variable entry in `var_snapshot`. Stored inline so the
 * decoder can drop entries whose visibility class is forbidden for
 * the requesting viewer without touching a separate manifest.
 */
export interface DeepLinkVarEntry {
  /** Variable name as recorded in VarStore. */
  readonly name: string;
  /** Snapshot value at encode-time. */
  readonly value: unknown;
  /** Visibility class the variable was created with. */
  readonly visibility: 'deck_public' | 'private' | 'server_only';
  /** Scope the value lives in (deck / slide / component_instance / session / viewer). */
  readonly scope: 'deck' | 'slide' | 'component_instance' | 'session' | 'viewer';
}

/**
 * The signed payload. `sig` is HMAC-SHA256 over the canonical JSON
 * of every field except `sig` itself.
 */
export interface DeepLinkPayload {
  /** Wire-format version. Mismatch → reject. */
  readonly v: typeof DEEP_LINK_VERSION;
  /** Absolute expiry, ms since epoch. Mismatch (now > exp) → reject. */
  readonly exp: number;
  /** ULID of the deck the link was generated for. */
  readonly deck_id: string;
  /** ULID of the slide to land on. */
  readonly slide_id: string;
  /** Path stack: ordered list of slide ids walked before the destination. */
  readonly path_stack: readonly string[];
  /** Open overlays at the destination. */
  readonly overlay_stack: readonly string[];
  /**
   * Snapshot of variable values. Each entry carries its visibility
   * class so the resolver can filter out private/server-only entries
   * for the requesting viewer.
   */
  readonly var_snapshot: ReadonlyArray<DeepLinkVarEntry>;
  /** Snapshot of device frame state (size + orientation). */
  readonly device_frame_state: Readonly<Record<string, unknown>>;
  /** Active scenario name (may be empty string for default). */
  readonly scenario: string;
  /** In-flight form drafts keyed by form instance id. */
  readonly form_drafts: Readonly<Record<string, unknown>>;
  /** Audience tag — decoder refuses `aud` mismatches. */
  readonly aud: DeepLinkAudience;
  /** Optional tenant id; required when `viewer_scope` is `tenant` or `private`. */
  readonly tenant_id?: string;
  /** HMAC-SHA256 signature of the canonical JSON of every other field. */
  readonly sig: string;
}

/** A short-link record returned by `Shortener.shorten` and persisted by the service. */
export interface DeepLink {
  /** Public short id (URL path: `/d/:id`). */
  readonly id: string;
  /** Key id used to sign the payload — supports 7-day rotation overlap. */
  readonly kid: string;
  /** How many times the short link has been resolved. */
  readonly click_count: number;
  /** Absolute expiry timestamp (ms since epoch). */
  readonly expires_at: number;
  /** Resolver scope: who is permitted to decode this link. */
  readonly viewer_scope: DeepLinkViewerScope;
  /** Tenant the link belongs to. */
  readonly tenant_id: string;
  /** Deck the link was generated for. */
  readonly deck_id: string;
  /** Original payload (without `sig`) for replay-safe single-use links. */
  readonly payload: DeepLinkPayload;
  /** ms timestamp. */
  readonly created_at: number;
  /** ms timestamp. */
  readonly created_by?: string;
}

/** Per-deck rotating signing key. `kid` is the public identifier. */
export interface DeepLinkSigningKey {
  readonly kid: string;
  /** 32-byte HMAC key, base64url encoded. */
  readonly secret: string;
  /** Absolute ms timestamp when this key becomes valid. */
  readonly not_before: number;
  /** Absolute ms timestamp when this key expires (overlap window starts here). */
  readonly not_after: number;
  /** Tenant + deck scope. */
  readonly tenant_id: string;
  readonly deck_id: string;
}

/** Resolver input bundle. */
export interface DeepLinkResolveInput {
  readonly tenant_id: string;
  readonly requesting_viewer_id?: string;
  readonly audience: DeepLinkAudience;
  readonly now: number;
}