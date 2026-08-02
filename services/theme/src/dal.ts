/**
 * Theme service — design-token persistence layer (Phase 07 A.1).
 *
 * The DAL is the only place that knows about Postgres in the theme
 * module; everything else speaks to the {@link TokenRepository} and
 * {@link ThemeRepository} interfaces.  This keeps unit tests hermetic
 * and decouples Phase 07 logic from the eventual pgx driver.
 *
 * Shapes mirror the SQL columns added by migrations 0017 (design
 * tokens), 0018 (themes + theme versions + overrides), and 0020
 * (audit_brand_event).
 */

import type { TokenValue, TokenGroup, TokenType, TokenRole } from '@domio/tokens';

// ---------------------------------------------------------------------------
// Token records
// ---------------------------------------------------------------------------

export interface TokenRecord {
  readonly tokenId: string;
  readonly orgId: string;
  readonly group: TokenGroup;
  readonly type: TokenType;
  readonly value: TokenValue;
  readonly description?: string;
  readonly roles?: readonly TokenRole[];
  readonly deprecated?: { replacedBy: string; sinceVersion: string };
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TokenAliasRecord {
  readonly aliasTokenId: string;
  readonly targetTokenId: string;
  readonly orgId: string;
}

export interface ThemeRecord {
  readonly themeId: string;
  readonly orgId: string;
  readonly name: string;
  readonly kind: 'built-in' | 'marketplace' | 'agency' | 'user';
  readonly parentThemeId?: string;
  readonly brandContextId?: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly signature: string;
}

export interface ThemeVersionRecord {
  readonly themeId: string;
  readonly version: number;
  readonly tokensResolved: ReadonlyMap<string, TokenValue>;
  readonly signature: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export type ThemeOverrideScope =
  | { readonly kind: 'slide'; readonly slideId: string }
  | { readonly kind: 'slide-range'; readonly slideIds: readonly string[] }
  | { readonly kind: 'section'; readonly sectionId: string }
  | { readonly kind: 'auto-layout-child-set'; readonly parentElementId: string }
  | { readonly kind: 'state-conditional'; readonly exprJson: string };

export interface ThemeOverrideRecord {
  readonly overrideId: string;
  readonly orgId: string;
  readonly deckId: string;
  readonly scope: ThemeOverrideScope;
  readonly tokensPartial: ReadonlyMap<string, TokenValue>;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface ThemeApplicationEventRecord {
  readonly eventId: string;
  readonly orgId: string;
  readonly deckId: string;
  readonly fromThemeId?: string;
  readonly toThemeId: string;
  readonly tokensChangedCount: number;
  readonly latencyMs: number;
  readonly actorId: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface TokenRepository {
  insert(record: TokenRecord): Promise<void>;
  update(
    tokenId: string,
    orgId: string,
    patch: Partial<Omit<TokenRecord, 'tokenId' | 'orgId' | 'createdAt'>>,
  ): Promise<TokenRecord>;
  findById(tokenId: string, orgId: string): Promise<TokenRecord | null>;
  listByOrg(orgId: string, group?: TokenGroup): Promise<TokenRecord[]>;
  delete(tokenId: string, orgId: string): Promise<void>;
}

export interface TokenAliasRepository {
  insert(record: TokenAliasRecord): Promise<void>;
  delete(aliasTokenId: string, orgId: string): Promise<void>;
  listByOrg(orgId: string): Promise<TokenAliasRecord[]>;
}

export interface ThemeRepository {
  insert(record: ThemeRecord): Promise<void>;
  findById(themeId: string, orgId: string): Promise<ThemeRecord | null>;
  listByOrg(orgId: string, kind?: ThemeRecord['kind']): Promise<ThemeRecord[]>;
}

export interface ThemeVersionRepository {
  insert(record: ThemeVersionRecord): Promise<void>;
  findLatest(themeId: string): Promise<ThemeVersionRecord | null>;
  listByTheme(themeId: string): Promise<ThemeVersionRecord[]>;
}

export interface ThemeOverrideRepository {
  insert(record: ThemeOverrideRecord): Promise<void>;
  listByDeck(deckId: string, orgId: string): Promise<ThemeOverrideRecord[]>;
  listByOrg(orgId: string): Promise<ThemeOverrideRecord[]>;
  delete(overrideId: string, orgId: string): Promise<void>;
}

export interface ThemeApplicationEventRepository {
  insert(record: ThemeApplicationEventRecord): Promise<void>;
  listByDeck(deckId: string, orgId: string, limit?: number): Promise<ThemeApplicationEventRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementations (used in tests + as a development fallback)
// ---------------------------------------------------------------------------

export class InMemoryTokenRepository implements TokenRepository {
  private store = new Map<string, TokenRecord>();
  private k(record: TokenRecord): string {
    return `${record.orgId}::${record.tokenId}`;
  }
  async insert(record: TokenRecord): Promise<void> {
    if (this.store.has(this.k(record))) {
      throw new Error(`Token ${record.tokenId} already exists for org ${record.orgId}`);
    }
    this.store.set(this.k(record), record);
  }
  async update(
    tokenId: string,
    orgId: string,
    patch: Partial<Omit<TokenRecord, 'tokenId' | 'orgId' | 'createdAt'>>,
  ): Promise<TokenRecord> {
    const existing = await this.findById(tokenId, orgId);
    if (!existing) throw new Error(`Token ${tokenId} not found for org ${orgId}`);
    const updated: TokenRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }
  async findById(tokenId: string, orgId: string): Promise<TokenRecord | null> {
    return this.store.get(`${orgId}::${tokenId}`) ?? null;
  }
  async listByOrg(orgId: string, group?: TokenGroup): Promise<TokenRecord[]> {
    const out: TokenRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId !== orgId) continue;
      if (group && r.group !== group) continue;
      out.push(r);
    }
    return out;
  }
  async delete(tokenId: string, orgId: string): Promise<void> {
    this.store.delete(`${orgId}::${tokenId}`);
  }
}

export class InMemoryTokenAliasRepository implements TokenAliasRepository {
  private store = new Map<string, TokenAliasRecord>();
  private k(record: TokenAliasRecord): string {
    return `${record.orgId}::${record.aliasTokenId}`;
  }
  async insert(record: TokenAliasRecord): Promise<void> {
    this.store.set(this.k(record), record);
  }
  async delete(aliasTokenId: string, orgId: string): Promise<void> {
    this.store.delete(`${orgId}::${aliasTokenId}`);
  }
  async listByOrg(orgId: string): Promise<TokenAliasRecord[]> {
    const out: TokenAliasRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId) out.push(r);
    }
    return out;
  }
}

export class InMemoryThemeRepository implements ThemeRepository {
  private store = new Map<string, ThemeRecord>();
  private k(record: ThemeRecord): string {
    return `${record.orgId}::${record.themeId}`;
  }
  async insert(record: ThemeRecord): Promise<void> {
    this.store.set(this.k(record), record);
  }
  async findById(themeId: string, orgId: string): Promise<ThemeRecord | null> {
    return this.store.get(`${orgId}::${themeId}`) ?? null;
  }
  async listByOrg(orgId: string, kind?: ThemeRecord['kind']): Promise<ThemeRecord[]> {
    const out: ThemeRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId !== orgId) continue;
      if (kind && r.kind !== kind) continue;
      out.push(r);
    }
    return out;
  }
}

export class InMemoryThemeVersionRepository implements ThemeVersionRepository {
  private store: ThemeVersionRecord[] = [];
  async insert(record: ThemeVersionRecord): Promise<void> {
    this.store.push(record);
  }
  async findLatest(themeId: string): Promise<ThemeVersionRecord | null> {
    const filtered = this.store.filter((r) => r.themeId === themeId);
    if (filtered.length === 0) return null;
    return filtered.reduce((acc, r) => (r.version > acc.version ? r : acc));
  }
  async listByTheme(themeId: string): Promise<ThemeVersionRecord[]> {
    return this.store.filter((r) => r.themeId === themeId);
  }
}

export class InMemoryThemeOverrideRepository implements ThemeOverrideRepository {
  private store = new Map<string, ThemeOverrideRecord>();
  private k(record: ThemeOverrideRecord): string {
    return `${record.orgId}::${record.overrideId}`;
  }
  async insert(record: ThemeOverrideRecord): Promise<void> {
    this.store.set(this.k(record), record);
  }
  async listByDeck(deckId: string, orgId: string): Promise<ThemeOverrideRecord[]> {
    const out: ThemeOverrideRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId && r.deckId === deckId) out.push(r);
    }
    return out;
  }
  async listByOrg(orgId: string): Promise<ThemeOverrideRecord[]> {
    const out: ThemeOverrideRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId) out.push(r);
    }
    return out;
  }
  async delete(overrideId: string, orgId: string): Promise<void> {
    this.store.delete(`${orgId}::${overrideId}`);
  }
}

export class InMemoryThemeApplicationEventRepository implements ThemeApplicationEventRepository {
  private store: ThemeApplicationEventRecord[] = [];
  async insert(record: ThemeApplicationEventRecord): Promise<void> {
    this.store.push(record);
  }
  async listByDeck(
    deckId: string,
    orgId: string,
    limit = 100,
  ): Promise<ThemeApplicationEventRecord[]> {
    return this.store
      .filter((r) => r.orgId === orgId && r.deckId === deckId)
      .slice(-limit);
  }
}