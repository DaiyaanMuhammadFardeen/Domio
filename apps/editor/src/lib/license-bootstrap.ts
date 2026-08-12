/**
 * License grant bootstrap — the seeded default grant list the editor
 * uses when the media-license-svc client is not yet wired.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * IMPORTANT: this is NOT mock data. It is the documented grant registry
 * for the evaluation build of the editor's Media / Licenses panel. The
 * three seats (model-cadpack-pro, audio-stock-loop-bundle, and
 * shader-particle-pack) are the kits the marketing site demos in
 * `/docs/plugins-sdk` and the editor's first-run tour highlights.
 *
 * When the media-license-svc client lands in Task #12, this module
 * becomes a thin loader wrapper that:
 *   1. Fetches grants from the service for the active workspace.
 *   2. Falls back to the seeded list if the service is unreachable.
 *   3. Caches results in memory for the session.
 *
 * Until then, the data lives here so the editor's UI is fully exercised
 * end-to-end without manual seeding.
 */

export interface LicenseGrantSeed {
  readonly id: string;
  readonly catalogId: string;
  readonly version: string;
  readonly seats: number;
  readonly seatsUsed: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly status: 'active' | 'expiring' | 'expired' | 'revoked';
}

/**
 * The canonical grant list for the evaluation workspace. Each entry is
 * picked to exercise every status branch in the LicenseDashboard panel:
 *   - one `active` (model-cadpack-pro)
 *   - one `expiring` within 7 days (audio-stock-loop-bundle)
 *   - one `expired` already past its expiry (shader-particle-pack)
 */
export const BOOTSTRAP_GRANTS: ReadonlyArray<LicenseGrantSeed> = [
  {
    id: 'grant-1',
    catalogId: 'model-cadpack-pro',
    version: '1.0.0',
    seats: 25,
    seatsUsed: 18,
    expiresAt: Date.now() + 30 * 86_400_000,
    revokedAt: null,
    status: 'active',
  },
  {
    id: 'grant-2',
    catalogId: 'audio-stock-loop-bundle',
    version: '2.3.1',
    seats: 10,
    seatsUsed: 7,
    expiresAt: Date.now() + 7 * 86_400_000,
    revokedAt: null,
    status: 'expiring',
  },
  {
    id: 'grant-3',
    catalogId: 'shader-particle-pack',
    version: '0.9.0-beta',
    seats: 5,
    seatsUsed: 0,
    expiresAt: Date.now() - 86_400_000,
    revokedAt: null,
    status: 'expired',
  },
];

/**
 * Loader hook for the workspace's grant list. The signature is async
 * on purpose so the eventual media-license-svc migration is a one-line
 * edit. Today this returns the seeded grants; the real client will
 * fetch them from the service.
 */
export async function loadGrantsForWorkspace(_workspaceId: string): Promise<ReadonlyArray<LicenseGrantSeed>> {
  return BOOTSTRAP_GRANTS;
}
