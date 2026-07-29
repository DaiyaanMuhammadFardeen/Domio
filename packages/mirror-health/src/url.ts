/**
 * URL validation — pure, no I/O. Throws UrlValidationError on bad input.
 *
 * Rules:
 *   - Must parse via the WHATWG URL parser.
 *   - Must use http: or https: protocol (no file:, git:, ssh:, etc.).
 *   - Must have a non-empty hostname.
 *   - Must not include userinfo (no embedded credentials).
 *
 * The library explicitly refuses to silently accept credentials in URLs because
 * that is one of the top causes of accidental secret leakage in
 * mirror/proxy config (see SECURITY.md §"Untrusted mirrors").
 */

export class UrlValidationError extends Error {
  public readonly code:
    | "URL_PARSE_FAILED"
    | "URL_BAD_PROTOCOL"
    | "URL_NO_HOST"
    | "URL_HAS_CREDENTIALS"
    | "URL_EMPTY";
  public readonly url: string;
  constructor(
    code: UrlValidationError["code"],
    message: string,
    url: string,
  ) {
    super(message);
    this.name = "UrlValidationError";
    this.code = code;
    this.url = url;
  }
}

/**
 * Validate a URL string. Returns a normalized URL on success, throws
 * UrlValidationError on failure. The returned URL is the result of
 * `new URL(input).href` so callers get a canonical form.
 */
export function validateMirrorUrl(input: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new UrlValidationError("URL_EMPTY", "URL must be a non-empty string", input);
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch (_err) {
    throw new UrlValidationError(
      "URL_PARSE_FAILED",
      `URL could not be parsed: ${input}`,
      input,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlValidationError(
      "URL_BAD_PROTOCOL",
      `URL must use http(s): protocol, got '${parsed.protocol}'`,
      input,
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new UrlValidationError(
      "URL_HAS_CREDENTIALS",
      "URL must not embed userinfo (username/password); use a separate auth mechanism",
      input,
    );
  }
  if (!parsed.hostname) {
    throw new UrlValidationError("URL_NO_HOST", "URL must include a hostname", input);
  }
  return parsed.href;
}