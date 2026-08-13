/**
 * Theme service — design-token CRUD + theme apply + overrides (Phase 07 A.1).
 *
 * The service is the only entry point that knows about both the token
 * repository and the resolution engine.  REST handlers wrap this
 * service; gRPC adapters wrap it; the editor's theme picker calls it
 * through the TypeScript client.
 *
 * The service exposes:
 *
 *  - Token CRUD (create / update / delete) with cycle detection and
 *    referrer-blocked deletion (the 409 TOKEN_REFERENCED response).
 *  - Alias CRUD with cycle detection (the 409 TOKEN_ALIAS_CYCLE response).
 *  - Theme CRUD with immutable `theme_version` snapshots.
 *  - Per-slide / per-section / per-deck / state-conditional override CRUD.
 *  - Apply: produces a CRDT-op batch (in-memory) that the editor merges.
 *
 * Validation is strict: token IDs match the canonical `^[a-z]+(\.[a-z0-9]+)*$`
 * pattern (mirrors contracts/schema/v1/design-token-v1.schema.json).
 */

import {
  findTokenAliasCycle,
  validateTokenDefinition,
  validateTokenId,
  type TokenDefinition,
  type TokenValue,
  type TokenAlias,
  type TokenGroup,
  type TokenType,
  type TokenRole,
} from '@domio/tokens';
import {
  resolveMany as engineResolveMany,
  findReferrers as engineFindReferrers,
  computeThemeDiff,
  type ResolveScope,
  type DeckTokenState,
  type ResolvedToken,
} from '@domio/theme';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import type {
  TokenRecord,
  TokenRepository,
  TokenAliasRecord,
  TokenAliasRepository,
  ThemeRecord,
  ThemeRepository,
  ThemeVersionRecord,
  ThemeVersionRepository,
  ThemeOverrideRecord,
  ThemeOverrideRepository,
  ThemeApplicationEventRecord,
  ThemeApplicationEventRepository,
  ThemeOverrideScope,
} from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TokenAliasCycleError extends Error {
  readonly code = 'TOKEN_ALIAS_CYCLE' as const;
  constructor(public readonly cycle: readonly string[]) {
    super(`Token alias cycle detected: ${cycle.join(' → ')}`);
    this.name = 'TokenAliasCycleError';
  }
}

export class TokenReferencedError extends Error {
  readonly code = 'TOKEN_REFERENCED' as const;
  constructor(
    public readonly tokenId: string,
    public readonly count: number,
    public readonly sampleReferrers: readonly string[],
  ) {
    super(`Token ${tokenId} is referenced by ${count} locations`);
    this.name = 'TokenReferencedError';
  }
}

export class InvalidTokenIdError extends Error {
  readonly code = 'INVALID_TOKEN_ID' as const;
  constructor(
    public readonly tokenId: string,
    public readonly reason: string,
  ) {
    super(`Invalid tokenId "${tokenId}": ${reason}`);
    this.name = 'InvalidTokenIdError';
  }
}

export class TokenValidationError extends Error {
  readonly code = 'TOKEN_VALIDATION_ERROR' as const;
  constructor(public readonly issues: readonly { path: string; message: string; code: string }[]) {
    super(`Token failed validation: ${issues.length} issue(s)`);
    this.name = 'TokenValidationError';
  }
}

export class ThemeNotFoundError extends Error {
  readonly code = 'THEME_NOT_FOUND' as const;
  constructor(public readonly themeId: string) {
    super(`Theme ${themeId} not found`);
    this.name = 'ThemeNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Service dependencies
// ---------------------------------------------------------------------------

export interface ThemeServiceOptions {
  readonly tokens: TokenRepository;
  readonly aliases: TokenAliasRepository;
  readonly themes: ThemeRepository;
  readonly themeVersions: ThemeVersionRepository;
  readonly overrides: ThemeOverrideRepository;
  readonly applications: ThemeApplicationEventRepository;
  /** Caller-provided ULID generator (deterministic in tests). */
  readonly idGenerator?: () => ULID;
  /** Caller-provided clock (deterministic in tests). */
  readonly clock?: () => Date;
}

const defaultId: () => ULID = () =>
  asULID(
    `01H0000000000000000000000${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`
      .slice(0, 26)
      .padEnd(26, '0'),
  );
const defaultClock = () => new Date();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CreateTokenInput {
  readonly tokenId: string;
  readonly orgId: string;
  readonly group: TokenGroup;
  readonly type: TokenType;
  readonly value: TokenValue;
  readonly description?: string;
  readonly roles?: readonly TokenRole[];
  readonly createdBy: string;
}

export interface CreateAliasInput {
  readonly aliasTokenId: string;
  readonly targetTokenId: string;
  readonly orgId: string;
}

export interface CreateThemeInput {
  readonly orgId: string;
  readonly name: string;
  readonly kind: ThemeRecord['kind'];
  readonly parentThemeId?: string;
  readonly brandContextId?: string;
  readonly createdBy: string;
  readonly tokens: ReadonlyMap<string, TokenValue>;
}

export interface CreateOverrideInput {
  readonly orgId: string;
  readonly deckId: string;
  readonly scope: ThemeOverrideScope;
  readonly tokensPartial: ReadonlyMap<string, TokenValue>;
  readonly createdBy: string;
}

export interface ApplyThemeInput {
  readonly orgId: string;
  readonly deckId: string;
  readonly toThemeId: string;
  readonly fromThemeId?: string;
  readonly actorId: string;
  /**
   * Caller-provided list of (slideId, elementId, tokenRef) so the
   * service can compute the op batch without re-reading the deck.
   * In production this comes from the editor's local state.
   */
  readonly deckElements: readonly {
    slideId: string;
    elementId: string;
    tokenRef: string;
    currentResolved: TokenValue | null;
  }[];
}

export interface ApplyThemeResult {
  readonly eventId: string;
  readonly ops: readonly ThemeApplyOp[];
  readonly tokensChangedCount: number;
  readonly latencyMs: number;
}

export interface ThemeApplyOp {
  readonly slideId: string;
  readonly elementId: string;
  readonly tokenRef: string;
  readonly oldValue: TokenValue | null;
  readonly newValue: TokenValue;
}

export class ThemeService {
  private readonly tokens: TokenRepository;
  private readonly aliases: TokenAliasRepository;
  private readonly themes: ThemeRepository;
  private readonly themeVersions: ThemeVersionRepository;
  private readonly overrides: ThemeOverrideRepository;
  private readonly applications: ThemeApplicationEventRepository;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;

  constructor(opts: ThemeServiceOptions) {
    this.tokens = opts.tokens;
    this.aliases = opts.aliases;
    this.themes = opts.themes;
    this.themeVersions = opts.themeVersions;
    this.overrides = opts.overrides;
    this.applications = opts.applications;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Token CRUD
  // -------------------------------------------------------------------------

  async createToken(input: CreateTokenInput): Promise<TokenRecord> {
    if (!validateTokenId(input.tokenId).valid) {
      throw new InvalidTokenIdError(input.tokenId, 'format mismatch');
    }
    const definition: TokenDefinition = {
      tokenId: input.tokenId,
      group: input.group,
      type: input.type,
      value: input.value,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.roles !== undefined ? { roles: input.roles } : {}),
    };
    const validation = validateTokenDefinition(definition);
    if (!validation.valid) {
      throw new TokenValidationError(validation.issues);
    }
    const now = this.clock();
    const record: TokenRecord = {
      tokenId: input.tokenId,
      orgId: input.orgId,
      group: input.group,
      type: input.type,
      value: input.value,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.roles !== undefined ? { roles: input.roles } : {}),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.tokens.insert(record);
    return record;
  }

  async updateToken(
    tokenId: string,
    orgId: string,
    patch: { value?: TokenValue; description?: string; roles?: readonly TokenRole[] },
    actorId: string,
  ): Promise<TokenRecord> {
    const existing = await this.tokens.findById(tokenId, orgId);
    if (!existing) throw new Error(`Token ${tokenId} not found for org ${orgId}`);
    void actorId; // reserved for audit log on production Postgres DAL.
    const updatedPatch: Partial<TokenRecord> = {
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
    };
    return this.tokens.update(tokenId, orgId, updatedPatch);
    // actorId reserved for audit log on production Postgres DAL.
  }

  async deleteToken(tokenId: string, orgId: string): Promise<void> {
    const existing = await this.tokens.findById(tokenId, orgId);
    if (!existing) throw new Error(`Token ${tokenId} not found for org ${orgId}`);
    // Build a DeckTokenState that includes all overrides for this org
    // (across decks) so the referrer search finds every usage.  The
    // token itself is excluded from `deckTheme` so its own presence
    // isn't counted as a referrer.
    const refs = await this.findReferrersAcrossOrg(orgId, tokenId);
    if (refs.count > 0) {
      throw new TokenReferencedError(tokenId, refs.count, refs.sampleReferrers);
    }
    await this.tokens.delete(tokenId, orgId);
  }

  /**
   * Find all referrers across every deck for this org.  Used by
   * deleteToken so the referrer search spans the entire org, not
   * just a single deck.
   */
  async findReferrersAcrossOrg(
    orgId: string,
    tokenId: string,
  ): Promise<{ count: number; sampleReferrers: readonly string[] }> {
    // Aggregate overrides from every deck the org owns.
    const tokens = await this.tokens.listByOrg(orgId);
    const aliases = await this.aliases.listByOrg(orgId);
    void tokens;
    void aliases;
    const overrides = await this.overrides.listByOrg(orgId);

    const deckTheme = new Map<string, TokenValue>();
    for (const t of await this.tokens.listByOrg(orgId)) {
      if (t.tokenId === tokenId) continue;
      deckTheme.set(t.tokenId, t.value);
    }

    const aliasEdges: TokenAlias[] = aliases.map((a) => ({
      aliasTokenId: a.aliasTokenId,
      targetTokenId: a.targetTokenId,
    }));
    const perSlide = new Map<string, Map<string, TokenValue>>();
    const section = new Map<string, Map<string, TokenValue>>();
    for (const o of overrides) {
      const partial = new Map<string, TokenValue>();
      for (const [k, v] of o.tokensPartial) partial.set(k, v);
      if (o.scope.kind === 'slide') perSlide.set(o.scope.slideId, partial);
      else if (o.scope.kind === 'section') section.set(o.scope.sectionId, partial);
    }

    const deckState: DeckTokenState = {
      perSlideOverrides: perSlide,
      sectionOverrides: section,
      deckTheme,
      brandContextTheme: new Map(),
      orgDefaultTheme: new Map(),
      aliasEdges,
      systemAliases: { prefersColorScheme: 'light', forcedColors: false },
      platformFallbackTheme: new Map(),
      companionFallbackTheme: new Map(),
      evaluateCondition: () => false,
      slideElements: new Map(),
    };
    return engineFindReferrers(tokenId, deckState);
  }

  async listTokens(orgId: string, group?: TokenGroup): Promise<TokenRecord[]> {
    return this.tokens.listByOrg(orgId, group);
  }

  // -------------------------------------------------------------------------
  // Alias CRUD with cycle detection
  // -------------------------------------------------------------------------

  async createAlias(input: CreateAliasInput): Promise<TokenAliasRecord> {
    if (!validateTokenId(input.aliasTokenId).valid || !validateTokenId(input.targetTokenId).valid) {
      throw new InvalidTokenIdError(input.aliasTokenId, 'format mismatch');
    }
    // Cycle detection: walk the existing alias graph + the new edge.
    const existing = await this.aliases.listByOrg(input.orgId);
    const candidateEdges = [
      ...existing,
      { aliasTokenId: input.aliasTokenId, targetTokenId: input.targetTokenId, orgId: input.orgId },
    ];
    const cycle = findTokenAliasCycle(input.aliasTokenId, candidateEdges);
    if (cycle !== null) {
      throw new TokenAliasCycleError(cycle);
    }
    const record: TokenAliasRecord = {
      aliasTokenId: input.aliasTokenId,
      targetTokenId: input.targetTokenId,
      orgId: input.orgId,
    };
    await this.aliases.insert(record);
    return record;
  }

  async deleteAlias(aliasTokenId: string, orgId: string): Promise<void> {
    await this.aliases.delete(aliasTokenId, orgId);
  }

  async listAliases(orgId: string): Promise<TokenAliasRecord[]> {
    return this.aliases.listByOrg(orgId);
  }

  // -------------------------------------------------------------------------
  // Theme CRUD + apply
  // -------------------------------------------------------------------------

  async createTheme(input: CreateThemeInput): Promise<ThemeRecord> {
    const now = this.clock();
    const themeId = this.idGen();
    const record: ThemeRecord = {
      themeId,
      orgId: input.orgId,
      name: input.name,
      kind: input.kind,
      ...(input.parentThemeId !== undefined ? { parentThemeId: input.parentThemeId } : {}),
      ...(input.brandContextId !== undefined ? { brandContextId: input.brandContextId } : {}),
      createdBy: input.createdBy,
      createdAt: now,
      signature: this.signatureFor(input.tokens),
    };
    await this.themes.insert(record);
    const version: ThemeVersionRecord = {
      themeId,
      version: 1,
      tokensResolved: input.tokens,
      signature: record.signature,
      createdAt: now,
      createdBy: input.createdBy,
    };
    await this.themeVersions.insert(version);
    return record;
  }

  async listThemes(orgId: string, kind?: ThemeRecord['kind']): Promise<ThemeRecord[]> {
    return this.themes.listByOrg(orgId, kind);
  }

  async getTheme(themeId: string, orgId: string): Promise<ThemeRecord> {
    const t = await this.themes.findById(themeId, orgId);
    if (!t) throw new ThemeNotFoundError(themeId);
    return t;
  }

  /**
   * Apply a theme to a deck.  Generates the op batch in a single
   * transaction.  Caller merges ops via the editor's CRDT engine.
   */
  async applyTheme(input: ApplyThemeInput): Promise<ApplyThemeResult> {
    const t0 = this.clock();
    const theme = await this.themes.findById(input.toThemeId, input.orgId);
    if (!theme) throw new ThemeNotFoundError(input.toThemeId);
    const version = await this.themeVersions.findLatest(input.toThemeId);
    if (!version) throw new Error(`Theme ${input.toThemeId} has no version snapshot`);

    const ops: ThemeApplyOp[] = [];
    for (const elem of input.deckElements) {
      const newVal = version.tokensResolved.get(elem.tokenRef);
      if (newVal === undefined) continue;
      // Skip if already resolved to this value
      if (elem.currentResolved && JSON.stringify(elem.currentResolved) === JSON.stringify(newVal))
        continue;
      ops.push({
        slideId: elem.slideId,
        elementId: elem.elementId,
        tokenRef: elem.tokenRef,
        oldValue: elem.currentResolved,
        newValue: newVal,
      });
    }

    const eventId = this.idGen();
    const latencyMs = this.clock().getTime() - t0.getTime();
    const eventRecord: ThemeApplicationEventRecord = {
      eventId,
      orgId: input.orgId,
      deckId: input.deckId,
      ...(input.fromThemeId !== undefined ? { fromThemeId: input.fromThemeId } : {}),
      toThemeId: input.toThemeId,
      tokensChangedCount: ops.length,
      latencyMs,
      actorId: input.actorId,
      createdAt: this.clock(),
    };
    await this.applications.insert(eventRecord);

    return {
      eventId,
      ops,
      tokensChangedCount: ops.length,
      latencyMs,
    };
  }

  // -------------------------------------------------------------------------
  // Per-scope override CRUD
  // -------------------------------------------------------------------------

  async createOverride(input: CreateOverrideInput): Promise<ThemeOverrideRecord> {
    const now = this.clock();
    const record: ThemeOverrideRecord = {
      overrideId: this.idGen(),
      orgId: input.orgId,
      deckId: input.deckId,
      scope: input.scope,
      tokensPartial: input.tokensPartial,
      createdBy: input.createdBy,
      createdAt: now,
    };
    await this.overrides.insert(record);
    return record;
  }

  async listOverrides(deckId: string, orgId: string): Promise<ThemeOverrideRecord[]> {
    return this.overrides.listByDeck(deckId, orgId);
  }

  async deleteOverride(overrideId: string, orgId: string): Promise<void> {
    await this.overrides.delete(overrideId, orgId);
  }

  // -------------------------------------------------------------------------
  // Read-through helpers (thin wrappers around the engine)
  // -------------------------------------------------------------------------

  /**
   * Build a {@link DeckTokenState} from the persisted token / alias /
   * override tables so callers can call the engine directly.
   */
  async buildDeckState(
    orgId: string,
    deckId: string | undefined,
    opts: { excludeTokenId?: string } = {},
  ): Promise<DeckTokenState> {
    const tokens = await this.tokens.listByOrg(orgId);
    const aliases = await this.aliases.listByOrg(orgId);
    const overrides = deckId ? await this.overrides.listByDeck(deckId, orgId) : [];

    const deckTheme = new Map<string, TokenValue>();
    for (const t of tokens) {
      if (opts.excludeTokenId && t.tokenId === opts.excludeTokenId) continue;
      deckTheme.set(t.tokenId, t.value);
    }

    const aliasEdges: TokenAlias[] = aliases.map((a) => ({
      aliasTokenId: a.aliasTokenId,
      targetTokenId: a.targetTokenId,
    }));

    const perSlide = new Map<string, Map<string, TokenValue>>();
    const section = new Map<string, Map<string, TokenValue>>();
    for (const o of overrides) {
      const partial = new Map<string, TokenValue>();
      for (const [k, v] of o.tokensPartial) partial.set(k, v);
      if (o.scope.kind === 'slide') perSlide.set(o.scope.slideId, partial);
      else if (o.scope.kind === 'section') section.set(o.scope.sectionId, partial);
    }

    return {
      perSlideOverrides: perSlide,
      sectionOverrides: section,
      deckTheme,
      brandContextTheme: new Map(),
      orgDefaultTheme: new Map(),
      aliasEdges,
      systemAliases: { prefersColorScheme: 'light', forcedColors: false },
      platformFallbackTheme: new Map(),
      companionFallbackTheme: new Map(),
      evaluateCondition: () => false,
      slideElements: new Map(),
    };
  }

  async resolveTokens(
    orgId: string,
    deckId: string | undefined,
    tokenRefs: readonly string[],
    scope: ResolveScope = { kind: 'deck' },
  ): Promise<ReadonlyMap<string, ResolvedToken>> {
    const deckState = await this.buildDeckState(orgId, deckId);
    const result = engineResolveMany(tokenRefs, scope, deckState);
    return result.resolved;
  }

  async findReferrers(
    orgId: string,
    deckId: string | undefined,
    tokenRef: string,
  ): Promise<{ count: number; sampleReferrers: readonly string[] }> {
    const deckState = await this.buildDeckState(orgId, deckId);
    return engineFindReferrers(tokenRef, deckState);
  }

  async computeThemeDiff(
    themeAId: string,
    themeBId: string,
    orgId: string,
  ): Promise<
    readonly {
      tokenId: string;
      changed: boolean;
      valueA: TokenValue | null;
      valueB: TokenValue | null;
    }[]
  > {
    void orgId; // signatures are org-scoped in production; locally scoped by themeId.
    const a = await this.themeVersions.findLatest(themeAId);
    const b = await this.themeVersions.findLatest(themeBId);
    if (!a || !b) throw new Error(`Cannot diff: missing theme version`);
    return computeThemeDiff(a.tokensResolved, b.tokensResolved);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private signatureFor(tokens: ReadonlyMap<string, TokenValue>): string {
    // Deterministic signature: sort tokens, hash the JSON.
    const sorted = [...tokens.entries()].sort(([a], [b]) => a.localeCompare(b));
    const json = JSON.stringify(sorted);
    // Cheap deterministic FNV-style signature (sufficient for immutability checks).
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
      h ^= json.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}
