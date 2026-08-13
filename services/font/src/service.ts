/**
 * Font service — custom font upload + license gating (Phase 07).
 *
 * The service validates each font's metadata against the
 * `font-asset-v1.schema.json` invariants: SHA-256 hex, weight 100..900,
 * at least one subset, license status.  License expiry and the
 * anti-piracy score feed the publish gate; uploads with
 * `antiPiracyScore >= 0.8` are rejected outright.
 */

import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import type {
  FontAssetRecord,
  FontFormat,
  FontLicenseStatus,
  FontAxes,
  FontAssetRepository,
} from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FontNotFoundError extends Error {
  readonly code = 'FONT_NOT_FOUND' as const;
  constructor(public readonly fontId: string) {
    super(`Font ${fontId} not found`);
    this.name = 'FontNotFoundError';
  }
}

export class FontValidationError extends Error {
  readonly code = 'FONT_VALIDATION_ERROR' as const;
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Font failed validation: ${issues.length} issue(s)`);
    this.name = 'FontValidationError';
  }
}

export class FontLicenseBlockedError extends Error {
  readonly code = 'FONT_LICENSE_BLOCKED' as const;
  constructor(
    public readonly fontId: string,
    public readonly reason: string,
  ) {
    super(`Font ${fontId} blocked by license: ${reason}`);
    this.name = 'FontLicenseBlockedError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface FontServiceOptions {
  readonly fonts: FontAssetRepository;
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

export interface UploadFontInput {
  readonly orgId: string;
  readonly kitId: string;
  readonly fileUrl: string;
  readonly format: FontFormat;
  readonly weight: number;
  readonly subsets: readonly string[];
  readonly glyphCoverage: Record<string, number>;
  readonly sha256: string;
  readonly licenseStatus: FontLicenseStatus;
  readonly licenseUrl?: string;
  readonly licenseExpiresAt?: Date;
  readonly axes?: FontAxes;
  readonly antiPiracyScore: number;
  readonly createdBy: string;
}

export class FontService {
  private readonly fonts: FontAssetRepository;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;

  constructor(opts: FontServiceOptions) {
    this.fonts = opts.fonts;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  async uploadFont(input: UploadFontInput): Promise<FontAssetRecord> {
    this.validateUpload(input);
    if (input.antiPiracyScore >= 0.8) {
      throw new FontLicenseBlockedError(input.sha256, 'anti-piracy score too high');
    }
    if (
      input.licenseStatus === 'restricted' &&
      input.licenseExpiresAt &&
      input.licenseExpiresAt.getTime() < this.clock().getTime()
    ) {
      throw new FontLicenseBlockedError(input.sha256, 'license expired');
    }
    const record: FontAssetRecord = {
      fontId: this.idGen(),
      kitId: input.kitId,
      orgId: input.orgId,
      fileUrl: input.fileUrl,
      format: input.format,
      weight: input.weight,
      subsets: input.subsets,
      glyphCoverage: input.glyphCoverage,
      ...(input.axes !== undefined ? { axes: input.axes } : {}),
      sha256: input.sha256,
      licenseStatus: input.licenseStatus,
      ...(input.licenseUrl !== undefined ? { licenseUrl: input.licenseUrl } : {}),
      ...(input.licenseExpiresAt !== undefined ? { licenseExpiresAt: input.licenseExpiresAt } : {}),
      antiPiracyScore: input.antiPiracyScore,
      createdBy: input.createdBy,
      createdAt: this.clock(),
    };
    await this.fonts.insert(record);
    return record;
  }

  async getFont(fontId: string, orgId: string): Promise<FontAssetRecord> {
    const r = await this.fonts.findById(fontId, orgId);
    if (!r) throw new FontNotFoundError(fontId);
    return r;
  }

  async listFontsByKit(kitId: string, orgId: string): Promise<FontAssetRecord[]> {
    return this.fonts.listByKit(kitId, orgId);
  }

  async listFontsByOrg(orgId: string): Promise<FontAssetRecord[]> {
    return this.fonts.listByOrg(orgId);
  }

  async updateLicense(
    fontId: string,
    orgId: string,
    patch: {
      licenseStatus?: FontLicenseStatus;
      licenseUrl?: string;
      licenseExpiresAt?: Date | null;
    },
  ): Promise<FontAssetRecord> {
    const existing = await this.fonts.findById(fontId, orgId);
    if (!existing) throw new FontNotFoundError(fontId);
    const updated = await this.fonts.update(fontId, orgId, {
      ...(patch.licenseStatus !== undefined ? { licenseStatus: patch.licenseStatus } : {}),
      ...(patch.licenseUrl !== undefined ? { licenseUrl: patch.licenseUrl } : {}),
      ...(patch.licenseExpiresAt !== undefined
        ? patch.licenseExpiresAt === null
          ? { licenseExpiresAt: undefined as unknown as Date }
          : { licenseExpiresAt: patch.licenseExpiresAt }
        : {}),
    });
    return updated;
  }

  async deleteFont(fontId: string, orgId: string): Promise<void> {
    const existing = await this.fonts.findById(fontId, orgId);
    if (!existing) throw new FontNotFoundError(fontId);
    await this.fonts.delete(fontId, orgId);
  }

  private validateUpload(input: UploadFontInput): void {
    const issues: { path: string; message: string }[] = [];
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
      issues.push({ path: 'sha256', message: 'SHA-256 must be 64 hex chars' });
    }
    if (input.weight < 100 || input.weight > 900) {
      issues.push({ path: 'weight', message: 'Weight must be 100..900' });
    }
    if (input.subsets.length === 0) {
      issues.push({ path: 'subsets', message: 'At least one subset required' });
    }
    for (const [block, pct] of Object.entries(input.glyphCoverage)) {
      if (pct < 0 || pct > 100) {
        issues.push({ path: `glyphCoverage.${block}`, message: 'Coverage must be 0..100' });
      }
    }
    if (input.antiPiracyScore < 0 || input.antiPiracyScore > 1) {
      issues.push({ path: 'antiPiracyScore', message: 'Anti-piracy score must be 0..1' });
    }
    if (issues.length > 0) throw new FontValidationError(issues);
  }
}
