/**
 * In-memory meeting integration store (Phase 18).
 *
 * Backs every method of {@link MeetingStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { MeetingIntegration, MeetingMarker } from '../types.js';
import type { MeetingStore } from './store.js';

export class InMemoryMeetingStore implements MeetingStore {
  private readonly integrations = new Map<string, MeetingIntegration>();
  private readonly markers = new Map<string, MeetingMarker>();

  // -------------------------------------------------------------------------
  // Integrations
  // -------------------------------------------------------------------------

  async upsertIntegration(integration: MeetingIntegration): Promise<void> {
    const key = `${integration.workspace_id}:${integration.vendor}`;
    this.integrations.set(key, integration);
  }

  async getIntegration(workspaceId: string, vendor: string): Promise<MeetingIntegration | null> {
    const key = `${workspaceId}:${vendor}`;
    return this.integrations.get(key) ?? null;
  }

  async listIntegrationsByWorkspace(workspaceId: string): Promise<MeetingIntegration[]> {
    const results: MeetingIntegration[] = [];
    for (const i of this.integrations.values()) {
      if (i.workspace_id === workspaceId) results.push(i);
    }
    return results;
  }

  async updateIntegrationStatus(id: string, status: string, updatedAt: Date): Promise<void> {
    for (const i of this.integrations.values()) {
      if (i.id === id) {
        const updated: MeetingIntegration = {
          ...i,
          status: status as MeetingIntegration['status'],
          updated_at: updatedAt,
        };
        const key = `${i.workspace_id}:${i.vendor}`;
        this.integrations.set(key, updated);
        return;
      }
    }
  }

  async deleteIntegration(id: string): Promise<void> {
    for (const [key, i] of this.integrations) {
      if (i.id === id) {
        this.integrations.delete(key);
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Markers
  // -------------------------------------------------------------------------

  async insertMarker(marker: MeetingMarker): Promise<void> {
    this.markers.set(marker.id, marker);
  }

  async listMarkersByMeeting(meetingId: string): Promise<MeetingMarker[]> {
    const results: MeetingMarker[] = [];
    for (const m of this.markers.values()) {
      if (m.meeting_id === meetingId) results.push(m);
    }
    return results;
  }

  async getFirstMarkerForMeeting(meetingId: string): Promise<MeetingMarker | null> {
    let earliest: MeetingMarker | null = null;
    for (const m of this.markers.values()) {
      if (m.meeting_id !== meetingId) continue;
      if (!earliest || m.transitioned_at.getTime() < earliest.transitioned_at.getTime()) {
        earliest = m;
      }
    }
    return earliest;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.integrations.clear();
    this.markers.clear();
  }
}
