/**
 * Error classes used by the deep-link codec and surrounding helpers.
 *
 * Each error carries a stable `code` so the service layer can map
 * them to HTTP status codes without string-matching.
 */

export class DeepLinkError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeepLinkError';
    this.code = code;
  }
}

/** Token failed HMAC verification. */
export class DeepLinkSignatureError extends DeepLinkError {
  constructor(message = 'Deep link signature failed verification') {
    super('DEEP_LINK_SIGNATURE_INVALID', message);
    this.name = 'DeepLinkSignatureError';
  }
}

/** Token wire-format version is unknown to this decoder. */
export class DeepLinkVersionError extends DeepLinkError {
  constructor(message = 'Deep link version is not supported') {
    super('DEEP_LINK_VERSION_UNSUPPORTED', message);
    this.name = 'DeepLinkVersionError';
  }
}

/** `now > payload.exp` — the link has expired. */
export class DeepLinkExpiredError extends DeepLinkError {
  constructor(message = 'Deep link has expired') {
    super('DEEP_LINK_EXPIRED', message);
    this.name = 'DeepLinkExpiredError';
  }
}

/** `payload.aud` does not match the requesting audience. */
export class DeepLinkAudienceMismatchError extends DeepLinkError {
  constructor(message = 'Deep link audience does not match the request') {
    super('DEEP_LINK_AUDIENCE_MISMATCH', message);
    this.name = 'DeepLinkAudienceMismatchError';
  }
}

/** Malformed token: bad base64url, missing fields, wrong JSON shape. */
export class DeepLinkMalformedError extends DeepLinkError {
  constructor(message = 'Deep link token is malformed') {
    super('DEEP_LINK_MALFORMED', message);
    this.name = 'DeepLinkMalformedError';
  }
}

/** Single-use link already consumed (click_count > 1). */
export class DeepLinkReplayError extends DeepLinkError {
  constructor(message = 'Deep link has already been consumed') {
    super('DEEP_LINK_REPLAY_REJECTED', message);
    this.name = 'DeepLinkReplayError';
  }
}

/** Viewer-scope filter excluded this viewer from decoding. */
export class DeepLinkScopeError extends DeepLinkError {
  constructor(message = 'Deep link is not visible to this viewer') {
    super('DEEP_LINK_SCOPE_REJECTED', message);
    this.name = 'DeepLinkScopeError';
  }
}

/** `kid` could not be resolved by the rotator (unknown / retired). */
export class DeepLinkUnknownKeyError extends DeepLinkError {
  constructor(message = 'Deep link signing key is unknown or retired') {
    super('DEEP_LINK_KEY_UNKNOWN', message);
    this.name = 'DeepLinkUnknownKeyError';
  }
}