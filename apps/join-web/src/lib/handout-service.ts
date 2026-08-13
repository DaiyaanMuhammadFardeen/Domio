/**
 * handout-service — resolves a signed handout link and fetches the
 * per-participant handout descriptor.
 *
 * Per Wave 5 §S5.3 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Two operations:
 *  - resolveHandoutToken(token): confirmed-token -> session code (used
 *    by the legacy redirect path).
 *  - fetchHandout(token): token -> HandoutDescriptor (the per-user
 *    handout, including attended slide references, personalized notes,
 *    and a call-to-action).
 */

export interface HandoutResolveResult {
  readonly session_code: string;
}

export interface HandoutAttendedSlide {
  readonly slide_id: string;
  readonly title: string;
  readonly index: number;
  readonly thumbnail_url: string | null;
}

export interface HandoutCta {
  readonly label: string;
  readonly href: string;
  readonly variant: 'primary' | 'secondary';
}

export interface HandoutDescriptor {
  readonly token: string;
  readonly session_id: string;
  readonly session_title: string;
  readonly presenter_display_name: string;
  readonly attended_slides: readonly HandoutAttendedSlide[];
  readonly notes: string;
  readonly call_to_action: HandoutCta | null;
  /** Optional PDF URL rendered by the handout-generator service. */
  readonly pdf_url: string | null;
  readonly issued_at: string;
  readonly expires_at: string;
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
  (typeof process !== 'undefined' ? (process.env['JOIN_WEB_API_BASE_URL'] ?? '') : '');

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

/**
 * Fetch the per-user handout descriptor for a signed token. The
 * descriptor powers the /h/{token} surface: attended slide list,
 * personalized notes, call-to-action, and an optional PDF export URL.
 */
export async function fetchHandout(
  token: string,
  baseUrl: string = DEFAULT_BASE,
  fetchFn: typeof fetch = fetch,
): Promise<HandoutDescriptor> {
  const url = `${baseUrl}/api/handout/${encodeURIComponent(token)}`;
  const res = await fetchFn(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new HandoutResolveError(res.status, `handout fetch failed: ${res.status}`);
  }
  return (await res.json()) as HandoutDescriptor;
}

/**
 * Service-shape export so callers can write
 * `import { handoutService } from '@/lib/handout-service'`
 * and then `await handoutService.fetch(token)`. The named functions
 * remain the source of truth — this is a thin aggregator.
 */
export const handoutService = {
  fetch: fetchHandout,
  resolve: resolveHandoutToken,
} as const;
