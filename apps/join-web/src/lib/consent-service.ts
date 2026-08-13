/**
 * consent-service — fetches the current GDPR consent policy version.
 *
 * Per Wave 5 §S5.10 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Today: returns a stubbed `'v1'` so the consent screen can persist
 * its choice without depending on the backend. A real implementation
 * hits `GET /v1/consent/policy-version` and caches the value in
 * memory for the session.
 */

export interface ConsentPolicy {
  readonly version: string;
}

export class ConsentPolicyFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ConsentPolicyFetchError';
  }
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['JOIN_WEB_API_BASE_URL'] ?? '' : '');

/**
 * Returns the current policy version. Throws on non-2xx responses.
 *
 * Defaults to `'v1'` when `fetchFn` is omitted (callers may pass a
 * mock and accept the default base URL).
 */
export async function fetchConsentPolicyVersion(
  baseUrl: string = DEFAULT_BASE,
  fetchFn: typeof fetch = fetch,
): Promise<ConsentPolicy> {
  const url = `${baseUrl}/v1/consent/policy-version`;
  const res = await fetchFn(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new ConsentPolicyFetchError(res.status, `policy fetch failed: ${res.status}`);
  }
  return (await res.json()) as ConsentPolicy;
}

/**
 * Static fallback — `'v1'`. Used by tests and by callers that want a
 * deterministic policy version without making a network round-trip.
 */
export const DEFAULT_POLICY_VERSION = 'v1';