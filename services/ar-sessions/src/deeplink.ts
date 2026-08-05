/**
 * AR Session — deep-link URL builder (Phase 11 M5.3).
 *
 * Builds the audience URL that gets encoded as a QR code.
 * Format mirrors the P10 deep-link convention:
 *   https://ar.domio.app/s/{session_id}?token={token}
 *
 * The QR encoding itself is client-side; this module just
 * structures the payload for it.
 */

export interface BuildAudienceUrlOptions {
  /** Session ID. */
  readonly sessionId: string;
  /** Signed session token. */
  readonly token: string;
  /** Base URL. Defaults to https://ar.domio.app. */
  readonly baseUrl?: string;
}

/**
 * Build the audience-facing deep-link URL.
 *
 * The URL format is:
 *   {baseUrl}/s/{sessionId}?token={token}
 *
 * Clients (iOS AR Quick Look / Android WebXR) resolve this URL
 * to launch the AR viewer with the session context.
 */
export function buildAudienceUrl(opts: BuildAudienceUrlOptions): string {
  const base = (opts.baseUrl ?? 'https://ar.domio.app').replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(opts.sessionId)}?token=${encodeURIComponent(opts.token)}`;
}

/**
 * Build a QR payload object. This is the structured data that
 * a client would encode into a QR code. The token string is
 * embedded in the audience URL.
 */
export interface QrPayload {
  readonly url: string;
  readonly sessionId: string;
  readonly expiresAt: string;
}

export function buildQrPayload(opts: {
  readonly sessionId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly baseUrl?: string;
}): QrPayload {
  const urlOpts: BuildAudienceUrlOptions = {
    sessionId: opts.sessionId,
    token: opts.token,
  };
  if (opts.baseUrl !== undefined) {
    (urlOpts as { baseUrl: string }).baseUrl = opts.baseUrl;
  }
  return {
    url: buildAudienceUrl(urlOpts),
    sessionId: opts.sessionId,
    expiresAt: opts.expiresAt.toISOString(),
  };
}
