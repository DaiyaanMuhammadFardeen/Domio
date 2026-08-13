/**
 * Brand service tests — covers kit CRUD, publish/unpublish/archive,
 * sub-brand cycle detection, brand contexts, and extraction jobs.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { BrandService } from './service.js';
import {
  BrandKitValidationError,
  BrandKitImmutableError,
  SubBrandCycleError,
  SubBrandDuplicateError,
  BrandKitNotFoundError,
  BrandContextNotFoundError,
} from './service.js';
import {
  InMemoryBrandKitRepository,
  InMemoryBrandContextRepository,
  InMemoryBrandKitSubBrandRepository,
  type BrandKitLogoRecord,
  type BrandKitPaletteRecord,
} from './dal.js';

const ORG = 'org-1';

function logo(
  variant: 'light' | 'dark' | 'mono' = 'light',
  size: 'sm' | 'md' | 'lg' | 'xl' = 'lg',
): BrandKitLogoRecord {
  return {
    logoId: `logo-${variant}-${size}`,
    kitId: 'unused-in-fixture',
    variant,
    size,
    format: 'svg',
    assetUrl: `https://cdn.example/${variant}.svg`,
    contentHash: 'sha256-' + variant + size,
    clearSpacePx: 24,
  };
}

function palette(
  tokenIds: string[],
  opts: { cvSafe?: boolean; hueSpacingDeg?: number } = {},
): BrandKitPaletteRecord {
  return {
    paletteId: `palette-${tokenIds.join('-')}`,
    kitId: 'unused-in-fixture',
    tokenIds,
    cvSafe: opts.cvSafe ?? true,
    hueSpacingDeg: opts.hueSpacingDeg ?? 60,
  };
}

function makeService() {
  let counter = 0;
  const ids: ULID[] = [];
  const idGen = () => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    const out = asULID(`${ts}${rand}`);
    ids.push(out);
    return out;
  };
  let now = new Date('2026-08-02T00:00:00Z');
  const clock = () => now;
  const svc = new BrandService({
    kits: new InMemoryBrandKitRepository(),
    contexts: new InMemoryBrandContextRepository(),
    subBrands: new InMemoryBrandKitSubBrandRepository(),
    idGenerator: idGen,
    clock,
  });
  return { svc, clock: { tick: () => (now = new Date(now.getTime() + 1000)) }, ids };
}

function baseCreateInput(overrides: Partial<Parameters<BrandService['createBrandKit']>[0]> = {}) {
  return {
    orgId: ORG,
    name: 'Acme',
    ownerOrgId: ORG,
    scope: 'org' as const,
    logos: [logo()],
    palettes: [palette(['color.brand.primary', 'color.brand.secondary'])],
    createdBy: 'alice',
    ...overrides,
  };
}

describe('BrandService — brand-kit CRUD', () => {
  it('creates a brand kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    expect(kit.kitId).toMatch(/^[0-9A-Z]{27}$/);
    expect(kit.name).toBe('Acme');
    expect(kit.signature).toMatch(/^[0-9a-f]{8}$/);
    expect(kit.publishedAt).toBeUndefined();
  });

  it('rejects a kit with no logos', async () => {
    const { svc } = makeService();
    await expect(svc.createBrandKit(baseCreateInput({ logos: [] }))).rejects.toBeInstanceOf(
      BrandKitValidationError,
    );
  });

  it('rejects a kit with no palettes', async () => {
    const { svc } = makeService();
    await expect(svc.createBrandKit(baseCreateInput({ palettes: [] }))).rejects.toBeInstanceOf(
      BrandKitValidationError,
    );
  });

  it('rejects invalid token IDs in palettes', async () => {
    const { svc } = makeService();
    await expect(
      svc.createBrandKit(
        baseCreateInput({
          palettes: [palette(['Invalid-Format'])],
        }),
      ),
    ).rejects.toBeInstanceOf(BrandKitValidationError);
  });

  it('rejects empty / oversized names', async () => {
    const { svc } = makeService();
    await expect(svc.createBrandKit(baseCreateInput({ name: '' }))).rejects.toBeInstanceOf(
      BrandKitValidationError,
    );
    await expect(
      svc.createBrandKit(baseCreateInput({ name: 'x'.repeat(257) })),
    ).rejects.toBeInstanceOf(BrandKitValidationError);
  });

  it('lists kits for an org, optionally filtered by status', async () => {
    const { svc } = makeService();
    const a = await svc.createBrandKit(baseCreateInput({ name: 'A' }));
    const b = await svc.createBrandKit(baseCreateInput({ name: 'B' }));
    await svc.publishBrandKit(a.kitId, ORG, 'alice');
    const all = await svc.listBrandKits(ORG);
    expect(all).toHaveLength(2);
    const published = await svc.listBrandKits(ORG, 'published');
    expect(published.map((k) => k.kitId)).toEqual([a.kitId]);
    const draft = await svc.listBrandKits(ORG, 'draft');
    expect(draft.map((k) => k.kitId)).toEqual([b.kitId]);
  });

  it('throws BrandKitNotFound when getting a missing kit', async () => {
    const { svc } = makeService();
    await expect(svc.getBrandKit('01H0000000000000000000000AB', ORG)).rejects.toBeInstanceOf(
      BrandKitNotFoundError,
    );
  });
});

describe('BrandService — publish/unpublish/archive', () => {
  it('publishes a draft kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    const published = await svc.publishBrandKit(kit.kitId, ORG, 'alice');
    expect(published.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects publishing an archived kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    await svc.archiveBrandKit(kit.kitId, ORG, 'replaced', 'alice');
    await expect(svc.publishBrandKit(kit.kitId, ORG, 'alice')).rejects.toBeInstanceOf(
      BrandKitValidationError,
    );
  });

  it('blocks mutation of a published kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    await svc.publishBrandKit(kit.kitId, ORG, 'alice');
    await expect(
      svc.updateBrandKit(kit.kitId, ORG, { name: 'Renamed', updatedBy: 'alice' }),
    ).rejects.toBeInstanceOf(BrandKitImmutableError);
  });

  it('allows mutation after unpublish', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    await svc.publishBrandKit(kit.kitId, ORG, 'alice');
    await svc.unpublishBrandKit(kit.kitId, ORG, 'alice');
    const updated = await svc.updateBrandKit(kit.kitId, ORG, {
      name: 'Renamed',
      updatedBy: 'alice',
    });
    expect(updated.name).toBe('Renamed');
  });

  it('archives a kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    const archived = await svc.archiveBrandKit(kit.kitId, ORG, 'replaced', 'alice');
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });
});

describe('BrandService — sub-brand DAG', () => {
  it('creates a parent → child relationship', async () => {
    const { svc } = makeService();
    const parent = await svc.createBrandKit(baseCreateInput({ name: 'Parent' }));
    const child = await svc.createBrandKit(baseCreateInput({ name: 'Child' }));
    const edge = await svc.addSubBrand({
      orgId: ORG,
      parentKitId: parent.kitId,
      childKitId: child.kitId,
      inheritanceType: 'extend',
    });
    expect(edge.inheritanceType).toBe('extend');
  });

  it('rejects a self-loop', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    await expect(
      svc.addSubBrand({
        orgId: ORG,
        parentKitId: kit.kitId,
        childKitId: kit.kitId,
        inheritanceType: 'extend',
      }),
    ).rejects.toBeInstanceOf(SubBrandCycleError);
  });

  it('rejects a 2-cycle', async () => {
    const { svc } = makeService();
    const a = await svc.createBrandKit(baseCreateInput({ name: 'A' }));
    const b = await svc.createBrandKit(baseCreateInput({ name: 'B' }));
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: a.kitId,
      childKitId: b.kitId,
      inheritanceType: 'extend',
    });
    await expect(
      svc.addSubBrand({
        orgId: ORG,
        parentKitId: b.kitId,
        childKitId: a.kitId,
        inheritanceType: 'extend',
      }),
    ).rejects.toBeInstanceOf(SubBrandCycleError);
  });

  it('rejects a 3-cycle', async () => {
    const { svc } = makeService();
    const a = await svc.createBrandKit(baseCreateInput({ name: 'A' }));
    const b = await svc.createBrandKit(baseCreateInput({ name: 'B' }));
    const c = await svc.createBrandKit(baseCreateInput({ name: 'C' }));
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: a.kitId,
      childKitId: b.kitId,
      inheritanceType: 'extend',
    });
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: b.kitId,
      childKitId: c.kitId,
      inheritanceType: 'extend',
    });
    await expect(
      svc.addSubBrand({
        orgId: ORG,
        parentKitId: c.kitId,
        childKitId: a.kitId,
        inheritanceType: 'extend',
      }),
    ).rejects.toBeInstanceOf(SubBrandCycleError);
  });

  it('rejects a duplicate relationship', async () => {
    const { svc } = makeService();
    const a = await svc.createBrandKit(baseCreateInput({ name: 'A' }));
    const b = await svc.createBrandKit(baseCreateInput({ name: 'B' }));
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: a.kitId,
      childKitId: b.kitId,
      inheritanceType: 'extend',
    });
    await expect(
      svc.addSubBrand({
        orgId: ORG,
        parentKitId: a.kitId,
        childKitId: b.kitId,
        inheritanceType: 'extend',
      }),
    ).rejects.toBeInstanceOf(SubBrandDuplicateError);
  });

  it('lists children and parents', async () => {
    const { svc } = makeService();
    const a = await svc.createBrandKit(baseCreateInput({ name: 'A' }));
    const b = await svc.createBrandKit(baseCreateInput({ name: 'B' }));
    const c = await svc.createBrandKit(baseCreateInput({ name: 'C' }));
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: a.kitId,
      childKitId: b.kitId,
      inheritanceType: 'extend',
    });
    await svc.addSubBrand({
      orgId: ORG,
      parentKitId: a.kitId,
      childKitId: c.kitId,
      inheritanceType: 'override',
    });
    const relations = await svc.listSubBrands(a.kitId, ORG);
    expect(relations.children).toHaveLength(2);
    expect(relations.parents).toHaveLength(0);
    const bRels = await svc.listSubBrands(b.kitId, ORG);
    expect(bRels.parents).toHaveLength(1);
  });
});

describe('BrandService — brand contexts', () => {
  it('creates a brand context', async () => {
    const { svc } = makeService();
    const ctx = await svc.createBrandContext({ orgId: ORG, name: 'Workspace', createdBy: 'alice' });
    expect(ctx.contextId).toMatch(/^[0-9A-Z]{27}$/);
    expect(ctx.activeKitId).toBeUndefined();
  });

  it('sets the active kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    const ctx = await svc.createBrandContext({ orgId: ORG, name: 'Workspace', createdBy: 'alice' });
    const updated = await svc.setActiveBrandKit(ctx.contextId, ORG, kit.kitId, 'alice');
    expect(updated.activeKitId).toBe(kit.kitId);
  });

  it('rejects active kit from a different org', async () => {
    const { svc } = makeService();
    const ctx = await svc.createBrandContext({ orgId: ORG, name: 'Workspace', createdBy: 'alice' });
    await expect(
      svc.setActiveBrandKit(ctx.contextId, ORG, '01H0000000000000000000000AB', 'alice'),
    ).rejects.toBeInstanceOf(BrandKitNotFoundError);
  });

  it('throws BrandContextNotFound when getting a missing context', async () => {
    const { svc } = makeService();
    await expect(svc.getBrandContext('01H0000000000000000000000AB', ORG)).rejects.toBeInstanceOf(
      BrandContextNotFoundError,
    );
  });

  it('archives a brand context', async () => {
    const { svc } = makeService();
    const ctx = await svc.createBrandContext({ orgId: ORG, name: 'Workspace', createdBy: 'alice' });
    await svc.archiveBrandContext(ctx.contextId, ORG, 'alice');
    const refreshed = await svc.getBrandContext(ctx.contextId, ORG);
    expect(refreshed.archivedAt).toBeInstanceOf(Date);
  });
});

describe('BrandService — extraction jobs', () => {
  it('starts an extraction job', async () => {
    const { svc } = makeService();
    const job = await svc.startExtraction({
      orgId: ORG,
      url: 'https://example.com',
      createdBy: 'alice',
    });
    expect(job.status).toBe('pending');
    expect(job.url).toBe('https://example.com');
  });

  it('updates an extraction job to running → completed', async () => {
    const { svc } = makeService();
    const started = await svc.startExtraction({
      orgId: ORG,
      url: 'https://example.com',
      createdBy: 'alice',
    });
    const running = await svc.updateExtractionJob(started.jobId, {
      status: 'running',
      stages: ['fetch', 'parse'],
    });
    expect(running.status).toBe('running');
    const completed = await svc.updateExtractionJob(started.jobId, {
      status: 'completed',
      stages: ['fetch', 'parse', 'colors', 'fonts', 'logo'],
      confidenceScores: { colors: 0.92, fonts: 0.81, logo: 0.73 },
    });
    expect(completed.status).toBe('completed');
    expect(completed.confidenceScores.colors).toBeCloseTo(0.92);
  });

  it('updates an extraction job to failed', async () => {
    const { svc } = makeService();
    const started = await svc.startExtraction({
      orgId: ORG,
      url: 'https://example.com',
      createdBy: 'alice',
    });
    const failed = await svc.updateExtractionJob(started.jobId, {
      status: 'failed',
      errorCode: 'EXTRACTION_TIMEOUT',
    });
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('EXTRACTION_TIMEOUT');
  });

  it('attests an extracted kit', async () => {
    const { svc } = makeService();
    const kit = await svc.createBrandKit(baseCreateInput());
    const attested = await svc.attestExtraction(kit.kitId, ORG, 'alice');
    expect(attested.extractionAttestationId).toMatch(/^[0-9A-Z]{27}$/);
  });
});
