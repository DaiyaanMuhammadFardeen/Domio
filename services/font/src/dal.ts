/**
 * Font service — persistence layer (Phase 07).
 *
 * Mirrors the `brand_kit_font_asset` table (migration 0019) and the
 * `audit_brand_event` table (migration 0020).  In-memory
 * implementations are used for tests + dev; production wires Postgres
 * with RLS scoped to `org_id`.
 */

export type FontFormat = 'woff2' | 'woff' | 'otf' | 'ttf' | 'ttc';
export type FontLicenseStatus = 'permissive' | 'restricted' | 'unknown';

export interface FontAxes {
  readonly weight?: { min: number; max: number };
  readonly width?: { min: number; max: number };
  readonly slant?: { min: number; max: number };
}

export interface FontAssetRecord {
  readonly fontId: string;
  readonly kitId: string;
  readonly orgId: string;
  readonly fileUrl: string;
  readonly format: FontFormat;
  readonly weight: number;
  readonly subsets: readonly string[];
  readonly glyphCoverage: Record<string, number>;
  readonly axes?: FontAxes;
  readonly sha256: string;
  readonly licenseStatus: FontLicenseStatus;
  readonly licenseUrl?: string;
  readonly licenseExpiresAt?: Date;
  readonly antiPiracyScore: number;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface FontAssetRepository {
  insert(record: FontAssetRecord): Promise<void>;
  findById(fontId: string, orgId: string): Promise<FontAssetRecord | null>;
  listByKit(kitId: string, orgId: string): Promise<FontAssetRecord[]>;
  listByOrg(orgId: string): Promise<FontAssetRecord[]>;
  update(
    fontId: string,
    orgId: string,
    patch: Partial<Omit<FontAssetRecord, 'fontId' | 'kitId' | 'orgId' | 'createdAt'>>,
  ): Promise<FontAssetRecord>;
  delete(fontId: string, orgId: string): Promise<void>;
}

export class InMemoryFontAssetRepository implements FontAssetRepository {
  private store = new Map<string, FontAssetRecord>();
  private k(record: FontAssetRecord): string {
    return `${record.orgId}::${record.fontId}`;
  }
  async insert(record: FontAssetRecord): Promise<void> {
    if (this.store.has(this.k(record))) {
      throw new Error(`Font ${record.fontId} already exists for org ${record.orgId}`);
    }
    this.store.set(this.k(record), record);
  }
  async findById(fontId: string, orgId: string): Promise<FontAssetRecord | null> {
    return this.store.get(`${orgId}::${fontId}`) ?? null;
  }
  async listByKit(kitId: string, orgId: string): Promise<FontAssetRecord[]> {
    const out: FontAssetRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId && r.kitId === kitId) out.push(r);
    }
    return out;
  }
  async listByOrg(orgId: string): Promise<FontAssetRecord[]> {
    const out: FontAssetRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId) out.push(r);
    }
    return out;
  }
  async update(
    fontId: string,
    orgId: string,
    patch: Partial<Omit<FontAssetRecord, 'fontId' | 'kitId' | 'orgId' | 'createdAt'>>,
  ): Promise<FontAssetRecord> {
    const existing = await this.findById(fontId, orgId);
    if (!existing) throw new Error(`Font ${fontId} not found for org ${orgId}`);
    const updated: FontAssetRecord = { ...existing, ...patch };
    this.store.set(`${orgId}::${fontId}`, updated);
    return updated;
  }
  async delete(fontId: string, orgId: string): Promise<void> {
    this.store.delete(`${orgId}::${fontId}`);
  }
}
