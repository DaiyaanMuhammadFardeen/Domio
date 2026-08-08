/**
 * pg-backed meeting integration store (Phase 18).
 *
 * Skeleton + nil-guards. Full DML lands in a later phase.
 * Accepts a `Pool` (pg's public interface). Every method checks
 * `s.pool == null` upfront and throws StoreNotConfiguredError.
 */

import type { Pool as PgPool } from 'pg';
import type { MeetingIntegration, MeetingMarker } from '../types.js';
import type { MeetingStore } from './store.js';

export class PgMeetingStore implements MeetingStore {
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Integrations
  // -------------------------------------------------------------------------

  async upsertIntegration(_integration: MeetingIntegration): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('upsertIntegration');
    throw new StoreNotImplementedError('upsertIntegration', { id: _integration.id });
  }

  async getIntegration(_workspaceId: string, _vendor: string): Promise<MeetingIntegration | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getIntegration');
    throw new StoreNotImplementedError('getIntegration', { workspaceId: _workspaceId, vendor: _vendor });
  }

  async listIntegrationsByWorkspace(_workspaceId: string): Promise<MeetingIntegration[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listIntegrationsByWorkspace');
    throw new StoreNotImplementedError('listIntegrationsByWorkspace', { workspaceId: _workspaceId });
  }

  async updateIntegrationStatus(_id: string, _status: string, _updatedAt: Date): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('updateIntegrationStatus');
    throw new StoreNotImplementedError('updateIntegrationStatus', { id: _id, status: _status });
  }

  async deleteIntegration(_id: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('deleteIntegration');
    throw new StoreNotImplementedError('deleteIntegration', { id: _id });
  }

  // -------------------------------------------------------------------------
  // Markers
  // -------------------------------------------------------------------------

  async insertMarker(_marker: MeetingMarker): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertMarker');
    throw new StoreNotImplementedError('insertMarker', { id: _marker.id });
  }

  async listMarkersByMeeting(_meetingId: string): Promise<MeetingMarker[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listMarkersByMeeting');
    throw new StoreNotImplementedError('listMarkersByMeeting', { meetingId: _meetingId });
  }

  async getFirstMarkerForMeeting(_meetingId: string): Promise<MeetingMarker | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getFirstMarkerForMeeting');
    throw new StoreNotImplementedError('getFirstMarkerForMeeting', { meetingId: _meetingId });
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreNotConfiguredError extends Error {
  readonly code = 'STORE_NOT_CONFIGURED' as const;
  constructor(public readonly op: string) {
    super(`pg store has no pool configured (op=${op})`);
    this.name = 'StoreNotConfiguredError';
  }
}

export class StoreNotImplementedError extends Error {
  readonly code = 'STORE_NOT_IMPLEMENTED' as const;
  constructor(public readonly op: string, public readonly args: Record<string, unknown>) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
