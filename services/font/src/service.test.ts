/**
 * Font service tests — covers upload, validation, license gates,
 * license updates, and deletion.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { FontService } from './service.js';
import { FontValidationError, FontLicenseBlockedError, FontNotFoundError } from './service.js';
import { InMemoryFontAssetRepository } from './dal.js';

const ORG = 'org-1';

function makeService() {
  let counter = 0;
  const idGen = (): ULID => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return asULID(`${ts}${rand}`);
  };
  const svc = new FontService({
    fonts: new InMemoryFontAssetRepository(),
    idGenerator: idGen,
  });
  return { svc };
}

function baseUpload(overrides: Partial<Parameters<FontService['uploadFont']>[0]> = {}) {
  return {
    orgId: ORG,
    kitId: 'kit-1',
    fileUrl: 'https://cdn.example/font.woff2',
    format: 'woff2' as const,
    weight: 400,
    subsets: ['latin'],
    glyphCoverage: { 'Basic Latin': 100 },
    sha256: 'a'.repeat(64),
    licenseStatus: 'permissive' as const,
    antiPiracyScore: 0.1,
    createdBy: 'alice',
    ...overrides,
  };
}

describe('FontService — upload', () => {
  it('uploads a clean font', async () => {
    const { svc } = makeService();
    const font = await svc.uploadFont(baseUpload());
    expect(font.fontId).toMatch(/^[0-9A-Z]{27}$/);
    expect(font.licenseStatus).toBe('permissive');
  });

  it('rejects invalid sha256', async () => {
    const { svc } = makeService();
    await expect(svc.uploadFont(baseUpload({ sha256: 'tooshort' }))).rejects.toBeInstanceOf(
      FontValidationError,
    );
  });

  it('rejects weight out of range', async () => {
    const { svc } = makeService();
    await expect(svc.uploadFont(baseUpload({ weight: 50 }))).rejects.toBeInstanceOf(
      FontValidationError,
    );
    await expect(svc.uploadFont(baseUpload({ weight: 9999 }))).rejects.toBeInstanceOf(
      FontValidationError,
    );
  });

  it('rejects empty subsets', async () => {
    const { svc } = makeService();
    await expect(svc.uploadFont(baseUpload({ subsets: [] }))).rejects.toBeInstanceOf(
      FontValidationError,
    );
  });

  it('blocks high anti-piracy score', async () => {
    const { svc } = makeService();
    await expect(svc.uploadFont(baseUpload({ antiPiracyScore: 0.9 }))).rejects.toBeInstanceOf(
      FontLicenseBlockedError,
    );
  });

  it('blocks expired restricted license', async () => {
    const { svc } = makeService();
    const expired = new Date('2020-01-01');
    await expect(
      svc.uploadFont(
        baseUpload({
          licenseStatus: 'restricted',
          licenseExpiresAt: expired,
          antiPiracyScore: 0.1,
        }),
      ),
    ).rejects.toBeInstanceOf(FontLicenseBlockedError);
  });

  it('accepts a still-valid restricted license', async () => {
    const { svc } = makeService();
    const future = new Date('2099-01-01');
    const font = await svc.uploadFont(
      baseUpload({
        licenseStatus: 'restricted',
        licenseExpiresAt: future,
        antiPiracyScore: 0.1,
      }),
    );
    expect(font.licenseStatus).toBe('restricted');
  });
});

describe('FontService — read', () => {
  it('lists fonts for a kit', async () => {
    const { svc } = makeService();
    const a = await svc.uploadFont(baseUpload({ kitId: 'kit-a', weight: 400 }));
    const b = await svc.uploadFont(baseUpload({ kitId: 'kit-a', weight: 700 }));
    const c = await svc.uploadFont(baseUpload({ kitId: 'kit-b', weight: 400 }));
    const fonts = await svc.listFontsByKit('kit-a', ORG);
    expect(fonts.map((f) => f.fontId).sort()).toEqual([a.fontId, b.fontId].sort());
    expect(fonts.find((f) => f.fontId === c.fontId)).toBeUndefined();
  });

  it('throws FontNotFound on missing', async () => {
    const { svc } = makeService();
    await expect(svc.getFont('missing', ORG)).rejects.toBeInstanceOf(FontNotFoundError);
  });
});

describe('FontService — license update + delete', () => {
  it('updates license status', async () => {
    const { svc } = makeService();
    const font = await svc.uploadFont(baseUpload());
    const updated = await svc.updateLicense(font.fontId, ORG, {
      licenseStatus: 'restricted',
      licenseUrl: 'https://example.com/license',
    });
    expect(updated.licenseStatus).toBe('restricted');
    expect(updated.licenseUrl).toBe('https://example.com/license');
  });

  it('clears license expiration when null is passed', async () => {
    const { svc } = makeService();
    const font = await svc.uploadFont(
      baseUpload({ licenseStatus: 'restricted', licenseExpiresAt: new Date('2099-01-01') }),
    );
    expect(font.licenseExpiresAt).toBeInstanceOf(Date);
    const cleared = await svc.updateLicense(font.fontId, ORG, { licenseExpiresAt: null });
    expect(cleared.licenseExpiresAt).toBeUndefined();
  });

  it('deletes a font', async () => {
    const { svc } = makeService();
    const font = await svc.uploadFont(baseUpload());
    await svc.deleteFont(font.fontId, ORG);
    await expect(svc.getFont(font.fontId, ORG)).rejects.toBeInstanceOf(FontNotFoundError);
  });
});
