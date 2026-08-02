import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { Errors } from '../errors.js';
import { signJws, verifyJws, uuid } from '../crypto/index.js';
import type { LicenseGrant, MarketplaceListing } from '../store/types.js';

export function isPaidListing(listing: MarketplaceListing): boolean {
  return !listing.isFree && listing.status === 'published' && (listing.priceCents ?? 0) > 0;
}

export interface IssueLicenseInput {
  workspaceId: string;
  userId?: string;
  catalogId: string;
  version: string;
  listingId: string;
  seats: number;
  now?: number;
}

export interface IssueLicenseResult {
  grant: LicenseGrant;
  token: string;
}

/**
 * Issue a signed license grant (compact JWS, HS256). Claims mirror the
 * `license_grant` row so verification can happen offline.
 */
export async function issueLicenseGrant(deps: ServiceDeps, input: IssueLicenseInput): Promise<LicenseGrant> {
  const store = deps.store;
  const now = input.now ?? nowMs(deps);
  const listing = await store.getListing(input.listingId);
  if (!listing) throw Errors.notFound(`listing ${input.listingId}`);

  const licenseId = uuid();
  const issuedAt = now;
  const expiresAt = issuedAt + deps.limits.offlineGraceMs * 12; // 1 year subscription window
  const offlineGraceUntil = expiresAt + deps.limits.offlineGraceMs;

  const token = signJws(
    {
      iss: 'domio-registry',
      sub: licenseId,
      license_id: licenseId,
      catalog_id: input.catalogId,
      version: input.version,
      listing_id: input.listingId,
      seats: input.seats,
      workspace_id: input.workspaceId,
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor(expiresAt / 1000),
      offline_grace_until: Math.floor(offlineGraceUntil / 1000),
    },
    deps.licenseSecret,
  );

  const grant: LicenseGrant = {
    id: licenseId,
    workspaceId: input.workspaceId,
    ...(input.userId ? { userId: input.userId } : {}),
    catalogId: input.catalogId,
    version: input.version,
    listingId: input.listingId,
    licenseId,
    seats: input.seats,
    signedToken: token,
    issuedAt,
    expiresAt,
    offlineGraceUntil,
    createdAt: now,
  };
  await store.putLicenseGrant(grant);
  return grant;
}

export interface VerifyLicenseInput {
  token: string;
  catalogId?: string;
  version?: string;
  workspaceId?: string;
  now?: number;
}

export interface VerifyLicenseResult {
  valid: boolean;
  grant?: LicenseGrant;
  reason?: string;
}

/**
 * Verify a license token. Order:
 *  1. JWS signature + shape
 *  2. catalog/version claims match what's being used
 *  3. revocation check (server state)
 *  4. expiry with 30-day offline grace
 */
export async function verifyLicense(deps: ServiceDeps, input: VerifyLicenseInput): Promise<VerifyLicenseResult> {
  const now = input.now ?? nowMs(deps);
  const verified = verifyJws(input.token, deps.licenseSecret);
  if (!verified.valid || !verified.payload) return { valid: false, reason: verified.reason ?? 'invalid-token' };
  const claims = verified.payload as Record<string, unknown>;
  const licenseId = String(claims.sub ?? '');

  if (input.catalogId && String(claims.catalog_id) !== input.catalogId) {
    return { valid: false, reason: 'catalog-mismatch' };
  }
  if (input.version && String(claims.version) !== input.version) {
    return { valid: false, reason: 'version-mismatch' };
  }

  const grant = await deps.store.getLicenseGrant(licenseId);
  if (!grant) return { valid: false, reason: 'unknown-license' };
  if (grant.revokedAt) return { valid: false, reason: 'revoked' };

  const expMs = Number(claims.exp ?? 0) * 1000;
  const graceMs = Number(claims.offline_grace_until ?? 0) * 1000;
  if (now > graceMs) return { valid: false, reason: 'offline-expired' };
  if (now > expMs && !grant.offlineGraceUntil) return { valid: false, reason: 'expired' };

  return { valid: true, grant };
}

/** Enforce the seat cap: concurrent active grants for the catalog in the workspace. */
export async function enforceSeats(
  deps: ServiceDeps,
  workspaceId: string,
  catalogId: string,
  grant: LicenseGrant,
): Promise<void> {
  const grants = await deps.store.listLicenseGrants(workspaceId, catalogId);
  const active = grants.filter((g) => !g.revokedAt && g.catalogId === catalogId);
  const used = active.reduce((sum, g) => sum + g.seats, 0);
  if (used > grant.seats) throw Errors.seatLimit(`License allows ${grant.seats} seats`);
}

export async function revokeLicense(deps: ServiceDeps, licenseId: string): Promise<void> {
  const grant = await deps.store.getLicenseGrant(licenseId);
  if (!grant) throw Errors.notFound(`license ${licenseId}`);
  await deps.store.revokeLicenseGrant(licenseId, nowMs(deps));
}
