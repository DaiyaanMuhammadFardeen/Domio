/**
 * Team service — lists workspace members + their roles.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty list (no live team data until the team-svc
 * lands in a later wave).
 */

export interface TeamMember {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: 'owner' | 'admin' | 'editor' | 'viewer';
}

export const BOOTSTRAP_TEAM: ReadonlyArray<TeamMember> = [];

export async function listTeam(_workspaceId: string): Promise<ReadonlyArray<TeamMember>> {
  return BOOTSTRAP_TEAM;
}