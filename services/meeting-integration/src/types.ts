/**
 * Meeting integration service — shared types and errors (Phase 18).
 *
 * Types for Zoom/Meet/Teams integration lifecycle, tokens, and markers.
 */

// ---------------------------------------------------------------------------
// Vendor & Status
// ---------------------------------------------------------------------------

export type Vendor = 'zoom' | 'meet' | 'teams';
export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// MeetingIntegration entity (aligned to DDL)
// ---------------------------------------------------------------------------

export interface MeetingIntegration {
  readonly id: string;
  readonly workspace_id: string;
  readonly vendor: Vendor;
  /** Encrypted OAuth tokens — opaque JSON blob */
  readonly auth: Record<string, unknown>;
  readonly status: IntegrationStatus;
  readonly connected_by: string;
  readonly connected_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ---------------------------------------------------------------------------
// MeetingIntegrationInput
// ---------------------------------------------------------------------------

export interface MeetingIntegrationInput {
  readonly workspace_id: string;
  readonly vendor: Vendor;
  readonly auth: Record<string, unknown>;
  readonly connected_by: string;
}

// ---------------------------------------------------------------------------
// MeetingToken
// ---------------------------------------------------------------------------

export interface MeetingToken {
  readonly token: string;
  readonly meeting_id: string;
  readonly presenter_id: string;
  readonly deck_id: string;
  readonly expires_at: Date;
}

export interface IssueTokenInput {
  readonly integration: MeetingIntegration;
  readonly meeting_id: string;
  readonly presenter_id: string;
  readonly deck_id: string;
  /** When the meeting ends — token expires 1h after this */
  readonly meeting_end_at: Date;
}

// ---------------------------------------------------------------------------
// MeetingMarker
// ---------------------------------------------------------------------------

export interface MeetingMarker {
  readonly id: string;
  readonly meeting_id: string;
  readonly slide_id: string;
  readonly transitioned_at: Date;
  readonly created_at: Date;
}

export interface RecordMarkerInput {
  readonly meeting_id: string;
  readonly slide_id: string;
  readonly transitioned_at: Date;
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

export interface MeetingIntegrationEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly actor_type: 'member' | 'guest' | 'agent' | 'system';
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface MeetingEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: MeetingEventEmitter = {
  async publish(): Promise<void> { /* drop */ },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class IntegrationNotFoundError extends Error {
  readonly code = 'INTEGRATION_NOT_FOUND' as const;
  constructor(vendor: Vendor, workspaceId: string) {
    super(`No ${vendor} integration found for workspace ${workspaceId}`);
    this.name = 'IntegrationNotFoundError';
  }
}

export class TokenInvalidError extends Error {
  readonly code = 'TOKEN_INVALID' as const;
  constructor(reason: string) {
    super(`Token invalid: ${reason}`);
    this.name = 'TokenInvalidError';
  }
}

export class MeetingNotActiveError extends Error {
  readonly code = 'MEETING_NOT_ACTIVE' as const;
  constructor(meetingId: string) {
    super(`Meeting ${meetingId} is not active`);
    this.name = 'MeetingNotActiveError';
  }
}

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}
