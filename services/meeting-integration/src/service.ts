/**
 * Meeting integration service (Phase 18).
 *
 * Transport-agnostic orchestration of Zoom/Meet/Teams integration lifecycle,
 * meeting tokens, and slide transition markers.
 *
 * Depends on:
 *  - {@link MeetingStore}       — persistence.
 *  - {@link MeetingEventEmitter} — event emission (default: noopEmitter).
 */

import { randomUUID } from 'crypto';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import type {
  MeetingIntegration,
  MeetingIntegrationInput,
  MeetingEventEmitter,
  MeetingMarker,
  Vendor,
} from './types.js';
import {
  IntegrationNotFoundError,
  noopEmitter,
} from './types.js';
import type { MeetingStore } from './store/store.js';
import { issueMeetingToken, verifyMeetingToken } from './tokens.js';
import { recordMarkerBody } from './markers.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface MeetingIntegrationServiceOptions {
  readonly store: MeetingStore;
  readonly eventEmitter?: MeetingEventEmitter;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
  /** ID generator. Default randomUUID. */
  readonly idGen?: () => string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MeetingIntegrationService {
  private readonly store: MeetingStore;
  private readonly emitter: MeetingEventEmitter;
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(opts: MeetingIntegrationServiceOptions) {
    if (!opts.store) throw new Error('MeetingIntegrationService: store is required');
    this.store = opts.store;
    this.emitter = opts.eventEmitter ?? noopEmitter;
    this.clock = opts.now ?? (() => new Date());
    this.idGenerator = opts.idGen ?? (() => randomUUID());
  }

  private idGen(): string {
    return this.idGenerator();
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Connect — store integration and set status to connected
  // -------------------------------------------------------------------------

  async connect(
    input: MeetingIntegrationInput,
    deckId?: string,
  ): Promise<MeetingIntegration> {
    checkFeature(FEATURE_FLAGS.integrations);

    const now = this.now();
    const existing = await this.store.getIntegration(input.workspace_id, input.vendor);

    const integration: MeetingIntegration = {
      id: existing?.id ?? this.idGen(),
      workspace_id: input.workspace_id,
      vendor: input.vendor,
      auth: input.auth,
      status: 'connected',
      connected_by: input.connected_by,
      connected_at: existing?.status === 'connected' ? existing.connected_at : now,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };

    await this.store.upsertIntegration(integration);

    // Emit meeting.session_started on first connect
    await this.emitter.publish('meeting.session_started', {
      event_id: this.idGen(),
      event_type: 'meeting.session_started',
      ts_ms: now.getTime(),
      workspace_id: input.workspace_id,
      actor_id: input.connected_by,
      actor_type: 'member',
      payload: {
        meeting_id: integration.id,
        deck_id: deckId ?? '',
        vendor: input.vendor,
        presenter_id: input.connected_by,
      },
    });

    return integration;
  }

  // -------------------------------------------------------------------------
  // Disconnect — set status to disconnected, keep row
  // -------------------------------------------------------------------------

  async disconnect(
    workspaceId: string,
    vendor: Vendor,
    deckId?: string,
  ): Promise<MeetingIntegration> {
    checkFeature(FEATURE_FLAGS.integrations);

    const existing = await this.store.getIntegration(workspaceId, vendor);
    if (!existing) throw new IntegrationNotFoundError(vendor, workspaceId);

    const now = this.now();
    await this.store.updateIntegrationStatus(existing.id, 'disconnected', now);

    // Emit meeting.session_ended
    await this.emitter.publish('meeting.session_ended', {
      event_id: this.idGen(),
      event_type: 'meeting.session_ended',
      ts_ms: now.getTime(),
      workspace_id: workspaceId,
      actor_id: existing.connected_by,
      actor_type: 'member',
      payload: {
        meeting_id: existing.id,
        deck_id: deckId ?? '',
        vendor,
        presenter_id: existing.connected_by,
        ended_at: now.toISOString(),
      },
    });

    return { ...existing, status: 'disconnected', updated_at: now };
  }

  // -------------------------------------------------------------------------
  // Get status (per workspace+vendor)
  // -------------------------------------------------------------------------

  async getStatus(
    workspaceId: string,
    vendor: Vendor,
  ): Promise<{ status: string; integration: MeetingIntegration | null }> {
    checkFeature(FEATURE_FLAGS.integrations);

    const integration = await this.store.getIntegration(workspaceId, vendor);
    return {
      status: integration?.status ?? 'disconnected',
      integration,
    };
  }

  // -------------------------------------------------------------------------
  // Get status all (per workspace)
  // -------------------------------------------------------------------------

  async getStatusAll(
    workspaceId: string,
  ): Promise<Array<{ vendor: Vendor; status: string; integration: MeetingIntegration | null }>> {
    checkFeature(FEATURE_FLAGS.integrations);

    const integrations = await this.store.listIntegrationsByWorkspace(workspaceId);
    const vendors: Vendor[] = ['zoom', 'meet', 'teams'];
    const byVendor = new Map(integrations.map(i => [i.vendor, i]));

    return vendors.map(v => ({
      vendor: v,
      status: byVendor.get(v)?.status ?? 'disconnected',
      integration: byVendor.get(v) ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // List active (status=connected)
  // -------------------------------------------------------------------------

  async listActive(workspaceId: string): Promise<MeetingIntegration[]> {
    checkFeature(FEATURE_FLAGS.integrations);

    const all = await this.store.listIntegrationsByWorkspace(workspaceId);
    return all.filter(i => i.status === 'connected');
  }

  // -------------------------------------------------------------------------
  // Issue meeting token
  // -------------------------------------------------------------------------

  async issueToken(
    workspaceId: string,
    vendor: Vendor,
    meetingId: string,
    presenterId: string,
    deckId: string,
    meetingEndAt: Date,
  ): Promise<import('./types.js').MeetingToken> {
    checkFeature(FEATURE_FLAGS.integrations);

    const integration = await this.store.getIntegration(workspaceId, vendor);
    if (!integration || integration.status !== 'connected') {
      throw new IntegrationNotFoundError(vendor, workspaceId);
    }

    return issueMeetingToken({
      integration,
      meeting_id: meetingId,
      presenter_id: presenterId,
      deck_id: deckId,
      meeting_end_at: meetingEndAt,
    }, { now: () => this.now() });
  }

  // -------------------------------------------------------------------------
  // Record meeting marker
  // -------------------------------------------------------------------------

  async recordMarker(
    input: import('./types.js').RecordMarkerInput,
  ): Promise<{ marker: MeetingMarker; isFirst: boolean }> {
    checkFeature(FEATURE_FLAGS.integrations);

    const marker = await recordMarkerBody(input, { now: () => this.now() });

    // Check if this is the first marker for this meeting
    const existingFirst = await this.store.getFirstMarkerForMeeting(input.meeting_id);
    const isFirst = existingFirst === null;

    await this.store.insertMarker(marker);

    // Emit meeting.session_started only on first marker
    if (isFirst) {
      // Find workspace from any integration associated with this meeting
      // For now, we use the marker's meeting_id to find it
      // In a real system, we'd look up the meeting→workspace mapping
      await this.emitter.publish('meeting.session_started', {
        event_id: this.idGen(),
        event_type: 'meeting.session_started',
        ts_ms: this.now().getTime(),
        workspace_id: '',
        actor_id: 'system',
        actor_type: 'system',
        payload: {
          meeting_id: input.meeting_id,
          deck_id: '',
          vendor: 'zoom',
          presenter_id: 'system',
        },
      });
    }

    return { marker, isFirst };
  }

  // -------------------------------------------------------------------------
  // Validate meeting token
  // -------------------------------------------------------------------------

  async validateToken(
    workspaceId: string,
    vendor: Vendor,
    token: string,
    meetingId: string,
    presenterId: string,
    deckId: string,
    expiresAtMs: number,
  ): Promise<void> {
    checkFeature(FEATURE_FLAGS.integrations);

    const integration = await this.store.getIntegration(workspaceId, vendor);
    if (!integration || integration.status !== 'connected') {
      throw new IntegrationNotFoundError(vendor, workspaceId);
    }

    verifyMeetingToken(
      { token, meeting_id: meetingId, presenter_id: presenterId, deck_id: deckId },
      expiresAtMs,
      { now: () => this.now() },
    );
  }
}
