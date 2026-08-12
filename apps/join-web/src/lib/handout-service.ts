/**
 * handout-service — resolves a signed handout link to a session code.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Replaces the inline fetch in apps/join-web/src/app/h/[token]/page.tsx.
 */

export interface HandoutResolveResult {
  readonly session_code: string;
}

export class HandoutResolveError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HandoutResolveError';
  }
}

const DEFAULT_BASE: string =
  (typeof window !== 'undefined' ? '' : '') +
  (typeof process !== 'undefined' ? process.env['JOIN_WEB_API_BASE_URL'] ?? '' : '');

/**
 * Resolve a signed handout token to a session code that the audience can
 * join. Throws on non-2xx or network errors — the caller is responsible
 * for surfacing the failure to the participant.
 */
export async function resolveHandoutToken(
  token: string,
  baseUrl: string = DEFAULT_BASE,
  fetchFn: typeof fetch = fetch,
): Promise<HandoutResolveResult> {
  const url = `${baseUrl}/api/handout/${encodeURIComponent(token)}/resolve`;
  const res = await fetchFn(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new HandoutResolveError(res.status, `handout resolve failed: ${res.status}`);
  }
  return (await res.json()) as HandoutResolveResult;
}
