/**
 * Meeting token pure logic (Phase 18).
 *
 * Token issuance, verification, and scope validation.
 * Tokens are HMAC-SHA256 strings scoped to a meeting, presenter, and deck.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { MeetingToken, IssueTokenInput } from './types.js';
import { TokenInvalidError } from './types.js';

// ---------------------------------------------------------------------------
// Token secret (injected or default in-memory)
// ---------------------------------------------------------------------------

let _globalSecret: Buffer | null = null;

export function setTokenSecret(secret: string): void {
  _globalSecret = Buffer.from(secret, 'utf-8');
}

export function getTokenSecret(): Buffer {
  if (!_globalSecret) {
    // Default in-memory secret for dev/test — NOT for production
    _globalSecret = Buffer.from('domio-meeting-token-dev-secret-change-me', 'utf-8');
  }
  return _globalSecret;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const MAX_TOKEN_LIFETIME_MS = 4 * 60 * 60 * 1000; // 4 hours
const POST_MEETING_BUFFER_MS = 60 * 60 * 1000; // 1 hour after meeting end

export interface IssueTokenDeps {
  readonly now?: () => Date;
  readonly secret?: Buffer;
}

export interface VerifyTokenInput {
  readonly token: string;
  readonly meeting_id: string;
  readonly presenter_id: string;
  readonly deck_id: string;
}

export interface VerifyTokenResult {
  readonly ok: boolean;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Compute token payload string
// ---------------------------------------------------------------------------

function tokenPayload(
  meetingId: string,
  presenterId: string,
  deckId: string,
  expiresAtMs: number,
): string {
  return `${meetingId}.${presenterId}.${deckId}.${expiresAtMs}`;
}

// ---------------------------------------------------------------------------
// issueMeetingToken
// ---------------------------------------------------------------------------

/**
 * Creates an opaque token string (HMAC-SHA256) for a meeting.
 * expires_at = min(meetingEndAt + 1h, now + 4h)
 */
export function issueMeetingToken(input: IssueTokenInput, deps?: IssueTokenDeps): MeetingToken {
  const now = deps?.now?.() ?? new Date();
  const secret = deps?.secret ?? getTokenSecret();

  // Compute expiry: min(meetingEndAt + 1h, now + 4h)
  const meetingEndExpiry = new Date(input.meeting_end_at.getTime() + POST_MEETING_BUFFER_MS);
  const maxLifetimeExpiry = new Date(now.getTime() + MAX_TOKEN_LIFETIME_MS);
  const expiresAt =
    meetingEndExpiry.getTime() < maxLifetimeExpiry.getTime() ? meetingEndExpiry : maxLifetimeExpiry;

  const payload = tokenPayload(
    input.meeting_id,
    input.presenter_id,
    input.deck_id,
    expiresAt.getTime(),
  );
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');

  return {
    token: hmac,
    meeting_id: input.meeting_id,
    presenter_id: input.presenter_id,
    deck_id: input.deck_id,
    expires_at: expiresAt,
  };
}

// ---------------------------------------------------------------------------
// verifyMeetingToken
// ---------------------------------------------------------------------------

/**
 * Verifies a meeting token — checks HMAC, expiry, and scope.
 * Returns {ok: true} on success, throws TokenInvalidError on failure.
 */
export function verifyMeetingToken(
  input: VerifyTokenInput,
  expiresAtMs: number,
  deps?: IssueTokenDeps,
): VerifyTokenResult {
  const now = deps?.now?.() ?? new Date();
  const secret = deps?.secret ?? getTokenSecret();

  // Check expiry
  if (now.getTime() > expiresAtMs) {
    throw new TokenInvalidError('token expired');
  }

  // Reconstruct expected token
  const payload = tokenPayload(input.meeting_id, input.presenter_id, input.deck_id, expiresAtMs);
  const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');

  // Timing-safe comparison
  const tokenBuf = Buffer.from(input.token, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');

  if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
    throw new TokenInvalidError('signature mismatch');
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// validateMeetingTokenScope
// ---------------------------------------------------------------------------

/**
 * Validates that a token's scope matches the expected meeting, presenter, and deck.
 */
export function validateMeetingTokenScope(
  token: string,
  meetingId: string,
  presenterId: string,
  deckId: string,
  expiresAtMs: number,
  deps?: IssueTokenDeps,
): VerifyTokenResult {
  return verifyMeetingToken(
    { token, meeting_id: meetingId, presenter_id: presenterId, deck_id: deckId },
    expiresAtMs,
    deps,
  );
}
