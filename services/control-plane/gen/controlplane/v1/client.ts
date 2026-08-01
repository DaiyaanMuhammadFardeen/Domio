/**
 * Generated types for domio.controlplane.v1 RPCs.
 *
 * This file mirrors the message definitions in
 * contracts/proto/domio/controlplane/v1/command.proto.
 *
 * These types are consumed by the control-plane service and any
 * downstream TypeScript consumers that need to interact with the
 * realtime collaboration session management API.
 *
 * @generated — do not edit by hand. Regenerate with `buf generate`.
 */

// ---------------------------------------------------------------------------
// HLC (from domio.realtime.v1)
// ---------------------------------------------------------------------------

/** Hybrid Logical Clock timestamp. */
export interface HLC {
  /** Physical component: unix nanoseconds. */
  physical: number;
  /** Logical counter: monotonic tie-breaker. */
  logical: number;
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

/** Request to obtain a WebSocket connection ticket for a deck. */
export interface StartRealtimeSessionRequest {
  /** Actor (user) identifier — ULID. */
  actorId: string;
  /** Deck to join for realtime collaboration. */
  deckId: string;
  /** Branch to join; defaults to "main" if omitted. */
  branchId?: string;
  /** Capabilities the client intends to use. */
  capabilities?: string[];
}

/** Response containing the ticket to connect to the realtime gateway. */
export interface StartRealtimeSessionResponse {
  /** Opaque session token the client presents to the gateway. */
  sessionToken: string;
  /** WebSocket URL the client should connect to. */
  gatewayUrl: string;
  /** The HLC resume point for this session. */
  resumeHlc: HLC;
  /** Heartbeat interval the client should use (milliseconds). */
  heartbeatIntervalMs: number;
}

/** Request to signal graceful disconnection. */
export interface EndRealtimeSessionRequest {
  /** Session token from StartRealtimeSessionResponse. */
  sessionToken: string;
  /** Optional reason for disconnecting. */
  reason?: string;
}

/** Confirms the session was terminated. */
export interface EndRealtimeSessionResponse {}

// ---------------------------------------------------------------------------
// Branch Management
// ---------------------------------------------------------------------------

/** Request to fetch the current head of a branch. */
export interface GetBranchHeadRequest {
  /** Deck identifier. */
  deckId: string;
  /** Branch identifier. */
  branchId: string;
}

/** Returns the live head for the requested branch. */
export interface GetBranchHeadResponse {
  head: BranchHead;
}

/** Describes a single branch. */
export interface BranchInfo {
  /** Branch identifier. */
  branchId: string;
  /** The current head HLC for this branch. */
  head: BranchHead;
  /** Number of active sessions on this branch. */
  activeSessions: number;
}

/** The live head for outbound fan-out. */
export interface BranchHead {
  deckId: string;
  branchId: string;
  hlc: HLC;
}

/** Request to list available branches for a deck. */
export interface ListBranchesRequest {
  /** Deck identifier. */
  deckId: string;
}

/** Response containing all branches for a deck. */
export interface ListBranchesResponse {
  branches: BranchInfo[];
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Control-plane specific error codes. */
export type ControlPlaneErrorCode =
  | 'INTERNAL'
  | 'DECK_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'SESSION_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'RATE_LIMITED';

/** Error returned by control-plane RPCs. */
export interface ControlPlaneError {
  code: ControlPlaneErrorCode;
  message: string;
  details?: Record<string, string>;
  traceId?: string;
}
