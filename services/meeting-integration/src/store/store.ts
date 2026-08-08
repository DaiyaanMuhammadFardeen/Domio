/**
 * Meeting integration store interface (Phase 18).
 *
 * Transport-agnostic persistence layer for meeting integrations and markers.
 * Two implementations:
 *  - {@link InMemoryMeetingStore} — used in tests and dev.
 *  - {@link PgMeetingStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { MeetingIntegration, MeetingMarker } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface MeetingStore {
  // -------------------------------------------------------------------------
  // Integrations
  // -------------------------------------------------------------------------

  upsertIntegration(integration: MeetingIntegration): Promise<void>;
  getIntegration(workspaceId: string, vendor: string): Promise<MeetingIntegration | null>;
  listIntegrationsByWorkspace(workspaceId: string): Promise<MeetingIntegration[]>;
  updateIntegrationStatus(id: string, status: string, updatedAt: Date): Promise<void>;
  deleteIntegration(id: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Markers
  // -------------------------------------------------------------------------

  insertMarker(marker: MeetingMarker): Promise<void>;
  listMarkersByMeeting(meetingId: string): Promise<MeetingMarker[]>;
  getFirstMarkerForMeeting(meetingId: string): Promise<MeetingMarker | null>;
}
