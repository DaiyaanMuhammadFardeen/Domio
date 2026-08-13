/**
 * @domio/presenter-session — etag helpers.
 *
 * The presenter-session row uses a BIGINT `version` column as the etag.
 * Clients send `If-Match: "<version>"` on every mutation; the server
 * rejects mismatches with 409 + current state.
 *
 * This helper translates between HTTP-style etag strings and the BIGINT
 * column. It deliberately does NOT use content hashes — version is monotonic
 * and cheaper to reason about.
 */

export interface ETagParseResult {
  ok: boolean;
  version?: number;
  error?: string;
}

const ETAG_RE = /^"(\d+)"$/;

/** Wrap an integer version as an HTTP-style etag: `"7"`. */
export function toEtag(version: number): string {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`toEtag: invalid version ${version}`);
  }
  return `"${version}"`;
}

/** Parse an etag string. Returns `{ ok: false, error }` on mismatch. */
export function parseEtag(input: string | null | undefined): ETagParseResult {
  if (!input) {
    return { ok: false, error: 'If-Match header is required' };
  }
  const m = ETAG_RE.exec(input.trim());
  if (!m) {
    return { ok: false, error: 'If-Match must be a quoted integer, e.g. "7"' };
  }
  const versionStr = m[1];
  if (versionStr === undefined) {
    return { ok: false, error: 'If-Match version is missing' };
  }
  const version = parseInt(versionStr, 10);
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, error: 'If-Match version must be >= 1' };
  }
  return { ok: true, version };
}

/** Strip quotes — useful for logging. */
export function stripEtag(input: string): string {
  return input.replace(/^"|"$/g, '');
}
