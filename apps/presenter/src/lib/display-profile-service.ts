/**
 * Display profile service — saves per-presenter display layouts
 * (primary / secondary window preferences).
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty profile list. The display-profile-svc client
 * will replace this in a later wave.
 */

export interface DisplayProfile {
  readonly id: string;
  readonly presenterId: string;
  readonly label: string;
  readonly primaryWindow: { x: number; y: number; w: number; h: number };
  readonly secondaryWindow?: { x: number; y: number; w: number; h: number };
  readonly updatedAtMs: number;
}

export const BOOTSTRAP_DISPLAY_PROFILES: ReadonlyArray<DisplayProfile> = [];

export async function listDisplayProfiles(
  _presenterId: string,
): Promise<ReadonlyArray<DisplayProfile>> {
  return BOOTSTRAP_DISPLAY_PROFILES;
}
