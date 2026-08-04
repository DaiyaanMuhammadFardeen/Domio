/**
 * Prototype-recorder service — domain types (Phase 10 M5).
 *
 * The wire shapes match the JSON-Schema contracts in
 * `contracts/schema/v1/prototype-session-v1.schema.json` and
 * `prototype-event-v1.schema.json`.
 *
 * Keys are 32 bytes (HMAC-SHA256), hex-encoded on the wire.
 */

export type ConsentTier = 'opt_in' | 'opt_out' | 'anonymous';

export type Region = 'us-east' | 'us-west' | 'eu-central' | 'ap-south' | 'ap-east';

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'slide_enter'
  | 'slide_exit'
  | 'click'
  | 'hover'
  | 'form_submit'
  | 'calculator_change'
  | 'rage_click'
  | 'error'
  | 'device_frame_change'
  | 'consent_change';

export interface PrototypeSession {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  /** Optional pointer back to the authenticated subject (DSR owner). */
  readonly subjectId: string | null;
  /** Stable per-session token; the recorder uses this to rejoin a session after reload. */
  readonly sessionToken: string;
  readonly consent: ConsentTier;
  readonly region: Region;
  readonly abVariant: string | null;
  /** Sampling rate captured at session-start; replay uses this for fidelity. */
  readonly samplingRate: number;
  /** Domain pin — once set, the session refuses events that mismatch. */
  readonly regionPinned: boolean;
  readonly kid: string;
  readonly startedAt: number;
  readonly lastEventAt: number;
  readonly expiresAt: number;
  /** Last `seq` ingested; the integrity chain uses this for prev_hash. */
  readonly lastSeq: number;
}

export interface PrototypeEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly sessionId: string;
  readonly seq: number;
  readonly eventType: EventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly prevHash: string;
  readonly eventHash: string;
  readonly kid: string;
  readonly createdAt: number;
  readonly clientFingerprint: string;
  readonly region: Region;
}

/**
 * One row of the `integrity_chain` ledger per `(tenantId, deckId, kid)`.
 *
 * The chain accepts events signed by any key whose `overlapUntil` is in
 * the future. After the overlap window expires, the key is no longer
 * used for verification but historical events retain their original
 * `event_hash`.
 */
export interface IntegrityKey {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly kid: string;
  /** 32-byte key, hex-encoded for transport. */
  readonly keyHex: string;
  readonly rotatedAt: number;
  /** Hard expiry — events signed after this are rejected outright. */
  readonly expiresAt: number;
  /** Soft expiry — verification accepts until this timestamp; new events use the successor. */
  readonly overlapUntil: number;
}
