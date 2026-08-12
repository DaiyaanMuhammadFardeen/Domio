/**
 * @domio/join-web — REST join client.
 *
 * Phase 16 W1. Wraps POST /v1/audience/join. The server is the
 * participant-session service; the response is the AudienceJoinBundle.
 */

import type {
  AudienceJoinBundle,
  AudienceSnapshot,
  ParticipantId,
  SessionCode,
} from '@domio/audience-service';

export interface JoinRequest {
  readonly session_code: SessionCode;
  readonly workspace_id: string;
  readonly participant_id: ParticipantId;
  readonly display_name: string;
  readonly locale: string;
  readonly fingerprint_hash?: string | null;
  readonly idempotency_key?: string;
}

export interface JoinResponse {
  readonly session_id: string;
  readonly bundle: AudienceSnapshot;
  readonly audience_session_id: string;
  readonly reconnect_token: string;
}

export class JoinError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'JoinError';
  }
}

export async function joinAudience(input: {
  apiBase: string;
  body: JoinRequest;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<JoinResponse> {
  const f = input.fetch ?? fetch;
  const res = await f(`${input.apiBase}/v1/audience/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input.body),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!res.ok) {
    let code = 'JOIN_FAILED';
    let message = `join failed: ${res.status}`;
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      if (body.code) code = body.code;
      if (body.message) message = body.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new JoinError(res.status, code, message);
  }
  return (await res.json()) as JoinResponse;
}

export async function fetchBundle(input: {
  apiBase: string;
  sessionId: string;
  audienceSessionId: string;
  fetch?: typeof fetch;
}): Promise<AudienceJoinBundle> {
  const f = input.fetch ?? fetch;
  const res = await f(`${input.apiBase}/v1/audience/sessions/${input.sessionId}/bundle?audience_session_id=${encodeURIComponent(input.audienceSessionId)}`);
  if (!res.ok) throw new JoinError(res.status, 'BUNDLE_FAILED', `bundle: ${res.status}`);
  return (await res.json()) as AudienceJoinBundle;
}