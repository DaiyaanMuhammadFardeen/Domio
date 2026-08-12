/**
 * Settings service — creator-side account settings.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CreatorSettings {
  readonly displayName: string;
  readonly bio: string;
  readonly payoutEmail: string;
}

export const BOOTSTRAP_CREATOR_SETTINGS: CreatorSettings = {
  displayName: '',
  bio: '',
  payoutEmail: '',
};

export async function fetchCreatorSettings(workspaceId: string): Promise<CreatorSettings> {
  try {
    return await fetcher<CreatorSettings>(
      API_BASE,
      `/v1/creator/settings?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
  } catch {
    return BOOTSTRAP_CREATOR_SETTINGS;
  }
}