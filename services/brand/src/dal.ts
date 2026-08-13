/**
 * Brand service — persistence layer (Phase 07 A.3).
 *
 * Mirrors migration 0019 (brand kits + logos + palettes + fonts + imagery
 * rules + sub-brand relationships) and 0020 (brand_context).
 *
 * The DAL exposes in-memory implementations for tests + dev.  The
 * production DAL wires Postgres with RLS scoped to `org_id` and the
 * `audit_brand_event` table is append-only.
 */

export type BrandKitStatus = 'draft' | 'published' | 'archived';
export type LogoVariant = 'light' | 'dark' | 'mono';
export type LicenseStatus = 'permissive' | 'restricted' | 'unknown';

// ---------------------------------------------------------------------------
// Brand kit records
// ---------------------------------------------------------------------------

export interface BrandKitRecord {
  readonly kitId: string;
  readonly orgId: string;
  readonly name: string;
  readonly ownerOrgId: string;
  readonly scope: 'org' | 'workspace' | 'team';
  readonly publishedAt?: Date;
  readonly archivedAt?: Date;
  readonly signature: string;
  readonly extractionAttestationId?: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandKitLogoRecord {
  readonly logoId: string;
  readonly kitId: string;
  readonly variant: LogoVariant;
  readonly size: 'sm' | 'md' | 'lg' | 'xl';
  readonly format: 'svg' | 'png';
  readonly assetUrl: string;
  readonly contentHash: string;
  readonly clearSpacePx: number;
}

export interface BrandKitPaletteRecord {
  readonly paletteId: string;
  readonly kitId: string;
  readonly tokenIds: readonly string[];
  readonly cvSafe: boolean;
  readonly hueSpacingDeg: number;
}

export interface BrandKitFontRecord {
  readonly fontRecordId: string;
  readonly kitId: string;
  readonly fontAssetId: string;
  readonly licenseStatus: LicenseStatus;
  readonly glyphCoverage: Record<string, number>;
  readonly axes?: Record<string, { min: number; max: number; default: number }>;
}

export interface BrandKitImageryRuleRecord {
  readonly ruleId: string;
  readonly kitId: string;
  readonly doRules: readonly string[];
  readonly dontRules: readonly string[];
  readonly minResolution: { width: number; height: number };
  readonly subjectSafeZonePolygon?: readonly { x: number; y: number }[];
  readonly allowedSources: readonly string[];
}

export interface BrandKitSubBrandRecord {
  readonly parentKitId: string;
  readonly childKitId: string;
  readonly inheritanceType: 'extend' | 'override';
  readonly orgId: string;
}

export interface BrandKitArchiveRecord {
  readonly kitId: string;
  readonly archivedAt: Date;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Brand context
// ---------------------------------------------------------------------------

export interface BrandContextRecord {
  readonly contextId: string;
  readonly orgId: string;
  readonly name: string;
  readonly activeKitId?: string;
  readonly archivedAt?: Date;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface BrandKitRepository {
  insert(record: BrandKitRecord): Promise<void>;
  update(kitId: string, orgId: string, patch: Partial<BrandKitRecord>): Promise<BrandKitRecord>;
  /** Atomically clear the publishedAt timestamp (used by unpublish). */
  clearPublishedAt(kitId: string, orgId: string): Promise<BrandKitRecord>;
  findById(kitId: string, orgId: string): Promise<BrandKitRecord | null>;
  listByOrg(orgId: string, status?: BrandKitStatus): Promise<BrandKitRecord[]>;
  archive(kitId: string, orgId: string, reason: string): Promise<void>;
}

export interface BrandContextRepository {
  insert(record: BrandContextRecord): Promise<void>;
  findById(contextId: string, orgId: string): Promise<BrandContextRecord | null>;
  listByOrg(orgId: string): Promise<BrandContextRecord[]>;
  setActiveKit(contextId: string, orgId: string, kitId: string): Promise<void>;
  archive(contextId: string, orgId: string): Promise<void>;
}

export interface BrandKitSubBrandRepository {
  insert(record: BrandKitSubBrandRecord): Promise<void>;
  listChildrenOf(kitId: string, orgId: string): Promise<BrandKitSubBrandRecord[]>;
  listParentsOf(kitId: string, orgId: string): Promise<BrandKitSubBrandRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryBrandKitRepository implements BrandKitRepository {
  private store = new Map<string, BrandKitRecord>();
  private k(kitId: string, orgId: string): string {
    return `${orgId}::${kitId}`;
  }
  async insert(record: BrandKitRecord): Promise<void> {
    this.store.set(this.k(record.kitId, record.orgId), record);
  }
  async update(
    kitId: string,
    orgId: string,
    patch: Partial<BrandKitRecord>,
  ): Promise<BrandKitRecord> {
    const existing = await this.findById(kitId, orgId);
    if (!existing) throw new Error(`Brand kit ${kitId} not found for org ${orgId}`);
    const updated: BrandKitRecord = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(this.k(kitId, orgId), updated);
    return updated;
  }
  async clearPublishedAt(kitId: string, orgId: string): Promise<BrandKitRecord> {
    const existing = await this.findById(kitId, orgId);
    if (!existing) throw new Error(`Brand kit ${kitId} not found for org ${orgId}`);
    const { publishedAt: _ignore, ...rest } = existing;
    void _ignore;
    const updated: BrandKitRecord = { ...rest, updatedAt: new Date() };
    this.store.set(this.k(kitId, orgId), updated);
    return updated;
  }
  async findById(kitId: string, orgId: string): Promise<BrandKitRecord | null> {
    return this.store.get(this.k(kitId, orgId)) ?? null;
  }
  async listByOrg(orgId: string, status?: BrandKitStatus): Promise<BrandKitRecord[]> {
    const out: BrandKitRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId !== orgId) continue;
      if (status === 'published' && !r.publishedAt) continue;
      if (status === 'archived' && !r.archivedAt) continue;
      if (status === 'draft' && r.publishedAt) continue;
      out.push(r);
    }
    return out;
  }
  async archive(kitId: string, orgId: string, reason: string): Promise<void> {
    const r = await this.findById(kitId, orgId);
    if (!r) throw new Error(`Brand kit ${kitId} not found for org ${orgId}`);
    this.store.set(this.k(kitId, orgId), {
      ...r,
      archivedAt: new Date(),
      updatedAt: new Date(),
    });
    void reason;
  }
}

export class InMemoryBrandContextRepository implements BrandContextRepository {
  private store = new Map<string, BrandContextRecord>();
  private k(contextId: string, orgId: string): string {
    return `${orgId}::${contextId}`;
  }
  async insert(record: BrandContextRecord): Promise<void> {
    this.store.set(this.k(record.contextId, record.orgId), record);
  }
  async findById(contextId: string, orgId: string): Promise<BrandContextRecord | null> {
    return this.store.get(this.k(contextId, orgId)) ?? null;
  }
  async listByOrg(orgId: string): Promise<BrandContextRecord[]> {
    const out: BrandContextRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId) out.push(r);
    }
    return out;
  }
  async setActiveKit(contextId: string, orgId: string, kitId: string): Promise<void> {
    const r = await this.findById(contextId, orgId);
    if (!r) throw new Error(`Brand context ${contextId} not found for org ${orgId}`);
    this.store.set(this.k(contextId, orgId), { ...r, activeKitId: kitId });
  }
  async archive(contextId: string, orgId: string): Promise<void> {
    const r = await this.findById(contextId, orgId);
    if (!r) throw new Error(`Brand context ${contextId} not found for org ${orgId}`);
    this.store.set(this.k(contextId, orgId), { ...r, archivedAt: new Date() });
  }
}

export class InMemoryBrandKitSubBrandRepository implements BrandKitSubBrandRepository {
  private store: BrandKitSubBrandRecord[] = [];
  async insert(record: BrandKitSubBrandRecord): Promise<void> {
    // Cycle detection: refuse if (parent, child) already exists or
    // would create a cycle.
    const childrenOfNewParent = await this.listChildrenOf(record.parentKitId, record.orgId);
    if (childrenOfNewParent.some((c) => c.childKitId === record.childKitId)) {
      throw new Error('Sub-brand relationship already exists');
    }
    // Walk up the parent's ancestors to detect cycles.
    const ancestors = new Set<string>();
    let cursor: string | undefined = record.parentKitId;
    while (cursor) {
      if (ancestors.has(cursor)) throw new Error('Sub-brand cycle detected');
      ancestors.add(cursor);
      const parents = await this.listParentsOf(cursor, record.orgId);
      cursor = parents[0]?.parentKitId;
    }
    if (ancestors.has(record.childKitId)) {
      throw new Error('Sub-brand cycle detected');
    }
    this.store.push(record);
  }
  async listChildrenOf(kitId: string, orgId: string): Promise<BrandKitSubBrandRecord[]> {
    return this.store.filter((r) => r.orgId === orgId && r.parentKitId === kitId);
  }
  async listParentsOf(kitId: string, orgId: string): Promise<BrandKitSubBrandRecord[]> {
    return this.store.filter((r) => r.orgId === orgId && r.childKitId === kitId);
  }
}
