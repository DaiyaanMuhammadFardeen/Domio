import type { ServiceDeps, } from '../deps.js';
import { nowMs } from '../deps.js';
import { Errors } from '../errors.js';
import { sha256Hex, signUrl } from '../crypto/index.js';
import { getPackageOrNull, listVersions } from '../catalog/catalog.js';
import { resolvePinTarget, type PinMode } from '../catalog/pins.js';
import { issueLicenseGrant, isPaidListing } from './license.js';
import type { LicenseGrant, UserLibraryItem } from '../store/types.js';

export interface InstallInput {
  workspaceId: string;
  userId: string;
  catalogId: string;
  version?: string;
  pinMode?: PinMode;
  pinValue?: string;
  seats?: number;
}

export interface InstalledBundleUrl {
  name: string;
  sha256: string;
  url: string;
  signed: boolean;
  expiresAt?: number;
}

export interface InstallResult {
  item: UserLibraryItem;
  version: string;
  bundleUrls: InstalledBundleUrl[];
  licenseGrant?: LicenseGrant;
  updated: boolean;
}

/**
 * Install (or update) a component in a workspace library.
 *
 * Steps:
 *  1. Resolve the target version from the pin mode.
 *  2. Verify content-addressed integrity of every bundle blob (tamper check).
 *  3. If the listing is paid and a license is required, issue a license grant.
 *  4. Upsert the library item.
 *  5. Produce bundle URLs — signed (5-min TTL) for private/paid, immutable
 *     long-lived for free packages.
 */
export async function installPackage(deps: ServiceDeps, input: InstallInput): Promise<InstallResult> {
  const store = deps.store;
  const now = nowMs(deps);

  const versions = await listVersions(deps, input.catalogId);
  if (!versions.length) throw Errors.notFound(`component ${input.catalogId}`);

  const available = versions.map((v) => v.version);
  let version = input.version;
  if (!version) {
    const resolved = await resolvePinTarget(deps, { pinMode: input.pinMode ?? 'track-latest' }, available);
    version = resolved.version;
  }
  const pkg = await getPackageOrNull(deps, input.catalogId, version);
  if (!pkg) throw Errors.pinUnavailable(`Version ${version} is not published`);
  if (pkg.deprecation && !input.version) {
    throw Errors.deprecated(`${input.catalogId} is deprecated: ${pkg.deprecation.reason}`);
  }

  // 2. Integrity verification of every referenced blob.
  for (const [name, hash] of Object.entries(pkg.files)) {
    const blob = await store.getBlob(hash);
    if (!blob) throw Errors.tampered(`Bundle blob "${name}" missing from store`);
    if (sha256Hex(blob.bytes) !== hash) throw Errors.tampered(`Bundle blob "${name}" failed hash verification`);
  }

  // 3. License for paid listings.
  let licenseGrant: LicenseGrant | undefined;
  const listing = await store.getListingByCatalogId(input.catalogId);
  if (listing && isPaidListing(listing)) {
    licenseGrant = await issueLicenseGrant(deps, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      catalogId: input.catalogId,
      version,
      listingId: listing.id,
      seats: input.seats ?? 1,
      now,
    });
  }

  // 4. Upsert library item.
  const existing = await store.getLibraryItem(input.userId, input.workspaceId, input.catalogId);
  const pinMode = input.pinMode ?? existing?.pinMode ?? 'track-latest';
  const item: UserLibraryItem = {
    id: existing?.id ?? (deps.ulid ? deps.ulid() : `${input.userId}:${input.catalogId}`),
    userId: input.userId,
    workspaceId: input.workspaceId,
    catalogId: input.catalogId,
    installedVersion: version,
    pinMode,
    ...(input.pinValue ? { pinValue: input.pinValue } : existing?.pinValue ? { pinValue: existing.pinValue } : {}),
    ...(licenseGrant ? { licenseGrantId: licenseGrant.id } : existing?.licenseGrantId ? { licenseGrantId: existing.licenseGrantId } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.putLibraryItem(item);

  // 5. Bundle URLs.
  const ttl = deps.limits.signedUrlTtlMs;
  const bundleUrls: InstalledBundleUrl[] = [];
  for (const [name, hash] of Object.entries(pkg.files)) {
    const isFree = !listing || isPaidListing(listing) === false;
    if (isFree) {
      bundleUrls.push({
        name,
        sha256: hash,
        url: `${deps.bundleBaseUrl}/bundles/${hash}`,
        signed: false,
      });
    } else {
      const path = `/bundles/${hash}`;
      const expiresAt = now + ttl;
      bundleUrls.push({
        name,
        sha256: hash,
        url: `${deps.bundleBaseUrl}${signUrl('GET', path, deps.signUrlSecret, expiresAt)}`,
        signed: true,
        expiresAt,
      });
    }
  }

  return { item, version, bundleUrls, ...(licenseGrant ? { licenseGrant } : {}), updated: Boolean(existing) };
}

export async function uninstallPackage(
  deps: ServiceDeps,
  userId: string,
  workspaceId: string,
  catalogId: string,
): Promise<void> {
  await deps.store.deleteLibraryItem(userId, workspaceId, catalogId);
}

export interface CheckForUpdatesInput {
  userId: string;
  workspaceId: string;
}

export interface UpdateInfo {
  catalogId: string;
  installedVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  pinned: boolean;
}

export async function checkForUpdates(deps: ServiceDeps, input: CheckForUpdatesInput): Promise<UpdateInfo[]> {
  const items = await deps.store.listLibraryItems(input.userId, input.workspaceId);
  const out: UpdateInfo[] = [];
  for (const item of items) {
    const versions = await listVersions(deps, item.catalogId);
    const available = versions.map((v) => v.version);
    const latest = available.length ? available[available.length - 1]! : item.installedVersion;
    out.push({
      catalogId: item.catalogId,
      installedVersion: item.installedVersion,
      latestVersion: latest,
      updateAvailable: item.installedVersion !== latest,
      pinned: item.pinMode !== 'track-latest',
    });
  }
  return out;
}
