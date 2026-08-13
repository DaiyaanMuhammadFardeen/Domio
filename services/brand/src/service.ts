/**
 * Brand service — brand kits, brand context, sub-brand graph (Phase 07 A.3).
 *
 * The service is the only entry point that knows about the brand-kit
 * repositories.  REST handlers wrap it; gRPC adapters wrap it; the
 * editor's brand picker calls it through the TypeScript client.
 *
 * Validation rules:
 *
 *  - Brand kit names are 1..256 chars.
 *  - Logos must include an assetUrl + contentHash.
 *  - Sub-brand relationships are org-scoped and form a DAG; cycles
 *    raise {@link SubBrandCycleError}.
 *  - Published kits are immutable by default; mutation paths must
 *    explicitly invoke `unpublish` first.
 *  - Brand contexts bind an active kit to a session/workspace.
 *
 * The extraction flow is a separate job — the service holds the
 * extraction-job record and an external worker (services/brand-extract)
 * updates it.  Tests bypass the worker and write the result directly.
 */

import { validateTokenId } from '@domio/tokens';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import type {
  BrandKitRecord,
  BrandKitRepository,
  BrandKitStatus,
  BrandKitLogoRecord,
  BrandKitPaletteRecord,
  BrandKitFontRecord,
  BrandKitImageryRuleRecord,
  BrandKitSubBrandRecord,
  BrandKitSubBrandRepository,
  BrandContextRecord,
  BrandContextRepository,
  BrandKitArchiveRecord,
} from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BrandKitNotFoundError extends Error {
  readonly code = 'BRAND_KIT_NOT_FOUND' as const;
  constructor(public readonly kitId: string) {
    super(`Brand kit ${kitId} not found`);
    this.name = 'BrandKitNotFoundError';
  }
}

export class BrandKitValidationError extends Error {
  readonly code = 'BRAND_KIT_VALIDATION_ERROR' as const;
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Brand kit failed validation: ${issues.length} issue(s)`);
    this.name = 'BrandKitValidationError';
  }
}

export class BrandKitImmutableError extends Error {
  readonly code = 'BRAND_KIT_IMMUTABLE' as const;
  constructor(public readonly kitId: string) {
    super(`Brand kit ${kitId} is published and immutable; unpublish first`);
    this.name = 'BrandKitImmutableError';
  }
}

export class SubBrandCycleError extends Error {
  readonly code = 'SUB_BRAND_CYCLE' as const;
  constructor(public readonly cycle: readonly string[]) {
    super(`Sub-brand cycle detected: ${cycle.join(' → ')}`);
    this.name = 'SubBrandCycleError';
  }
}

export class SubBrandDuplicateError extends Error {
  readonly code = 'SUB_BRAND_DUPLICATE' as const;
  constructor(
    public readonly parentKitId: string,
    public readonly childKitId: string,
  ) {
    super(`Sub-brand ${childKitId} → ${parentKitId} already exists`);
    this.name = 'SubBrandDuplicateError';
  }
}

export class BrandContextNotFoundError extends Error {
  readonly code = 'BRAND_CONTEXT_NOT_FOUND' as const;
  constructor(public readonly contextId: string) {
    super(`Brand context ${contextId} not found`);
    this.name = 'BrandContextNotFoundError';
  }
}

export class ExtactionJobNotFoundError extends Error {
  readonly code = 'BRAND_EXTRACTION_JOB_NOT_FOUND' as const;
  constructor(public readonly jobId: string) {
    super(`Brand extraction job ${jobId} not found`);
    this.name = 'ExtactionJobNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Service dependencies
// ---------------------------------------------------------------------------

export interface BrandServiceOptions {
  readonly kits: BrandKitRepository;
  readonly contexts: BrandContextRepository;
  readonly subBrands: BrandKitSubBrandRepository;
  readonly idGenerator?: () => ULID;
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

export const BRAND_KIT_SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateBrandKitInput {
  readonly orgId: string;
  readonly name: string;
  readonly ownerOrgId: string;
  readonly scope: BrandKitRecord['scope'];
  readonly logos: readonly BrandKitLogoRecord[];
  readonly palettes: readonly BrandKitPaletteRecord[];
  readonly imageryRules?: BrandKitImageryRuleRecord;
  readonly fonts?: readonly BrandKitFontRecord[];
  readonly metadata?: Record<string, string>;
  readonly createdBy: string;
}

export interface UpdateBrandKitInput {
  readonly name?: string;
  readonly scope?: BrandKitRecord['scope'];
  readonly logos?: readonly BrandKitLogoRecord[];
  readonly palettes?: readonly BrandKitPaletteRecord[];
  readonly imageryRules?: BrandKitImageryRuleRecord;
  readonly fonts?: readonly BrandKitFontRecord[];
  readonly metadata?: Record<string, string>;
  readonly updatedBy: string;
}

export interface CreateBrandContextInput {
  readonly orgId: string;
  readonly name: string;
  readonly createdBy: string;
}

export interface StartExtractionInput {
  readonly orgId: string;
  readonly url: string;
  readonly createdBy: string;
  readonly attribution?: Record<string, string>;
}

export interface ExtractionProgressUpdate {
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly stages?: readonly string[];
  readonly confidenceScores?: Record<string, number>;
  readonly resultKitId?: string;
  readonly errorCode?: string;
}

export interface BrandExtractionJob {
  readonly jobId: string;
  readonly orgId: string;
  readonly url: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly stages: readonly string[];
  readonly attribution: Record<string, string>;
  readonly confidenceScores: Record<string, number>;
  readonly resultKitId?: string;
  readonly errorCode?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BrandService {
  private readonly kits: BrandKitRepository;
  private readonly contexts: BrandContextRepository;
  private readonly subBrands: BrandKitSubBrandRepository;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;

  private readonly extractions = new Map<string, BrandExtractionJob>();

  constructor(opts: BrandServiceOptions) {
    this.kits = opts.kits;
    this.contexts = opts.contexts;
    this.subBrands = opts.subBrands;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Brand-kit CRUD
  // -------------------------------------------------------------------------

  async createBrandKit(input: CreateBrandKitInput): Promise<BrandKitRecord> {
    this.validateKitName(input.name);
    if (input.logos.length === 0) {
      throw new BrandKitValidationError([
        { path: 'logos', message: 'A brand kit must include at least one logo' },
      ]);
    }
    if (input.palettes.length === 0) {
      throw new BrandKitValidationError([
        { path: 'palettes', message: 'A brand kit must include at least one palette' },
      ]);
    }
    for (const palette of input.palettes) {
      for (const tokenId of palette.tokenIds) {
        if (!validateTokenId(tokenId).valid) {
          throw new BrandKitValidationError([
            { path: `palettes[].tokenIds[]`, message: `Invalid tokenId "${tokenId}"` },
          ]);
        }
      }
    }
    const now = this.clock();
    const kitId = this.idGen();
    const record: BrandKitRecord = {
      kitId,
      orgId: input.orgId,
      name: input.name,
      ownerOrgId: input.ownerOrgId,
      scope: input.scope,
      signature: this.signatureFor(input),
      ...(input.imageryRules ? { imageryRules: input.imageryRules } : {}),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.kits.insert(record);
    return record;
  }

  async getBrandKit(kitId: string, orgId: string): Promise<BrandKitRecord> {
    const r = await this.kits.findById(kitId, orgId);
    if (!r) throw new BrandKitNotFoundError(kitId);
    return r;
  }

  async listBrandKits(orgId: string, status?: BrandKitStatus): Promise<BrandKitRecord[]> {
    return this.kits.listByOrg(orgId, status);
  }

  async updateBrandKit(
    kitId: string,
    orgId: string,
    patch: UpdateBrandKitInput,
  ): Promise<BrandKitRecord> {
    const existing = await this.kits.findById(kitId, orgId);
    if (!existing) throw new BrandKitNotFoundError(kitId);
    if (existing.publishedAt && !existing.archivedAt) {
      throw new BrandKitImmutableError(kitId);
    }
    if (patch.name !== undefined) this.validateKitName(patch.name);
    const updated = await this.kits.update(kitId, orgId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.logos !== undefined ? { logos: patch.logos } : {}),
      ...(patch.palettes !== undefined ? { palettes: patch.palettes } : {}),
      ...(patch.imageryRules !== undefined ? { imageryRules: patch.imageryRules } : {}),
      ...(patch.fonts !== undefined ? { fonts: patch.fonts } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    });
    return updated;
  }

  async publishBrandKit(kitId: string, orgId: string, actorId: string): Promise<BrandKitRecord> {
    void actorId;
    const existing = await this.kits.findById(kitId, orgId);
    if (!existing) throw new BrandKitNotFoundError(kitId);
    if (existing.archivedAt) {
      throw new BrandKitValidationError([
        { path: 'status', message: 'Cannot publish an archived kit' },
      ]);
    }
    return this.kits.update(kitId, orgId, {
      publishedAt: this.clock(),
      updatedAt: this.clock(),
    });
  }

  async unpublishBrandKit(kitId: string, orgId: string, actorId: string): Promise<BrandKitRecord> {
    void actorId;
    const existing = await this.kits.findById(kitId, orgId);
    if (!existing) throw new BrandKitNotFoundError(kitId);
    return this.kits.clearPublishedAt(kitId, orgId);
  }

  async archiveBrandKit(
    kitId: string,
    orgId: string,
    reason: string,
    actorId: string,
  ): Promise<BrandKitRecord> {
    void actorId;
    const existing = await this.kits.findById(kitId, orgId);
    if (!existing) throw new BrandKitNotFoundError(kitId);
    await this.kits.archive(kitId, orgId, reason);
    const after = await this.kits.findById(kitId, orgId);
    return after ?? { ...existing, archivedAt: this.clock() };
  }

  // -------------------------------------------------------------------------
  // Sub-brand relationships
  // -------------------------------------------------------------------------

  async addSubBrand(input: {
    readonly orgId: string;
    readonly parentKitId: string;
    readonly childKitId: string;
    readonly inheritanceType: 'extend' | 'override';
  }): Promise<BrandKitSubBrandRecord> {
    if (input.parentKitId === input.childKitId) {
      throw new SubBrandCycleError([input.parentKitId, input.childKitId]);
    }
    try {
      const record: BrandKitSubBrandRecord = {
        parentKitId: input.parentKitId,
        childKitId: input.childKitId,
        inheritanceType: input.inheritanceType,
        orgId: input.orgId,
      };
      await this.subBrands.insert(record);
      return record;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'Sub-brand relationship already exists') {
        throw new SubBrandDuplicateError(input.parentKitId, input.childKitId);
      }
      if (msg === 'Sub-brand cycle detected') {
        throw new SubBrandCycleError([input.parentKitId, input.childKitId]);
      }
      throw e;
    }
  }

  async listSubBrands(
    kitId: string,
    orgId: string,
  ): Promise<{
    readonly children: readonly BrandKitSubBrandRecord[];
    readonly parents: readonly BrandKitSubBrandRecord[];
  }> {
    const [children, parents] = await Promise.all([
      this.subBrands.listChildrenOf(kitId, orgId),
      this.subBrands.listParentsOf(kitId, orgId),
    ]);
    return { children, parents };
  }

  // -------------------------------------------------------------------------
  // Brand context
  // -------------------------------------------------------------------------

  async createBrandContext(input: CreateBrandContextInput): Promise<BrandContextRecord> {
    const record: BrandContextRecord = {
      contextId: this.idGen(),
      orgId: input.orgId,
      name: input.name,
      createdAt: this.clock(),
    };
    await this.contexts.insert(record);
    return record;
  }

  async getBrandContext(contextId: string, orgId: string): Promise<BrandContextRecord> {
    const r = await this.contexts.findById(contextId, orgId);
    if (!r) throw new BrandContextNotFoundError(contextId);
    return r;
  }

  async listBrandContexts(orgId: string): Promise<BrandContextRecord[]> {
    return this.contexts.listByOrg(orgId);
  }

  async setActiveBrandKit(
    contextId: string,
    orgId: string,
    kitId: string,
    actorId: string,
  ): Promise<BrandContextRecord> {
    void actorId;
    // Resolve target kit to confirm it belongs to this org.
    const kit = await this.kits.findById(kitId, orgId);
    if (!kit) throw new BrandKitNotFoundError(kitId);
    await this.contexts.setActiveKit(contextId, orgId, kitId);
    return (await this.contexts.findById(contextId, orgId))!;
  }

  async archiveBrandContext(contextId: string, orgId: string, actorId: string): Promise<void> {
    void actorId;
    await this.contexts.archive(contextId, orgId);
  }

  // -------------------------------------------------------------------------
  // Extraction jobs (the worker writes to these)
  // -------------------------------------------------------------------------

  async startExtraction(input: StartExtractionInput): Promise<BrandExtractionJob> {
    const jobId = this.idGen();
    const job: BrandExtractionJob = {
      jobId,
      orgId: input.orgId,
      url: input.url,
      status: 'pending',
      stages: [],
      attribution: input.attribution ?? {},
      confidenceScores: {},
      createdAt: this.clock(),
      updatedAt: this.clock(),
    };
    this.extractions.set(jobId, job);
    return job;
  }

  async getExtractionJob(jobId: string): Promise<BrandExtractionJob> {
    const job = this.extractions.get(jobId);
    if (!job) throw new ExtactionJobNotFoundError(jobId);
    return job;
  }

  async updateExtractionJob(
    jobId: string,
    update: ExtractionProgressUpdate,
  ): Promise<BrandExtractionJob> {
    const job = this.extractions.get(jobId);
    if (!job) throw new ExtactionJobNotFoundError(jobId);
    const next: BrandExtractionJob = {
      ...job,
      status: update.status,
      ...(update.stages !== undefined ? { stages: update.stages } : {}),
      ...(update.confidenceScores !== undefined
        ? { confidenceScores: update.confidenceScores }
        : {}),
      ...(update.resultKitId !== undefined ? { resultKitId: update.resultKitId } : {}),
      ...(update.errorCode !== undefined ? { errorCode: update.errorCode } : {}),
      updatedAt: this.clock(),
    };
    this.extractions.set(jobId, next);
    return next;
  }

  async attestExtraction(kitId: string, orgId: string, actorId: string): Promise<BrandKitRecord> {
    const existing = await this.kits.findById(kitId, orgId);
    if (!existing) throw new BrandKitNotFoundError(kitId);
    const attestationId = this.idGen();
    void attestationId;
    void actorId;
    return this.kits.update(kitId, orgId, {
      extractionAttestationId: attestationId,
      updatedAt: this.clock(),
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private validateKitName(name: string): void {
    if (typeof name !== 'string' || name.length < 1 || name.length > 256) {
      throw new BrandKitValidationError([
        { path: 'name', message: 'Brand kit name must be 1..256 characters' },
      ]);
    }
  }

  private signatureFor(input: CreateBrandKitInput): string {
    const json = JSON.stringify({
      name: input.name,
      scope: input.scope,
      ownerOrgId: input.ownerOrgId,
      logos: input.logos.map((l) => ({
        variant: l.variant,
        size: l.size,
        format: l.format,
        hash: l.contentHash,
      })),
      palettes: input.palettes.map((p) => ({
        tokenIds: [...p.tokenIds].sort(),
        cvSafe: p.cvSafe,
        hueSpacingDeg: p.hueSpacingDeg,
      })),
    });
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
      h ^= json.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

// ---------------------------------------------------------------------------
// Re-export archive record for handoff doc.
// ---------------------------------------------------------------------------
export type { BrandKitArchiveRecord };
