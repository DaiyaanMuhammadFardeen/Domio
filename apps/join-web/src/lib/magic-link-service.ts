/**
 * magic-link-service — consumes a signed guest-access token.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Replaces the inline fetch in apps/magic-link-landing/src/app/page.tsx.
 * The file lives under join-web/src/lib/ per doc placement; the magic-link
 * landing app consumes it via a tsconfig path alias.
 */

export interface MagicLinkConsumeResult {
  readonly scope_type: string;
  readonly scope_id: string;
  readonly guest_email: string;
}

export type MagicLinkErrorCode =
  | 'invalid_token'
  | 'expired'
  | 'consumed'
  | 'already_consumed'
  | 'revoked'
  | 'unknown';

export interface MagicLinkErrorBody {
  readonly error: MagicLinkErrorCode | string;
  readonly message: string;
}

export class MagicLinkConsumeError extends Error {
  readonly status: number;
  readonly code: MagicLinkErrorCode;
  constructor(status: number, code: MagicLinkErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'MagicLinkConsumeError';
  }
}

const DEFAULT_BASE: string =
  typeof process !== 'undefined' ? (process.env['NEXT_PUBLIC_API_BASE'] ?? '') : '';

/**
 * Consume a magic-link token. Returns the redirect target + signed-in
 * email on success; throws a typed error on failure so the landing page
 * can branch on `status` + `code`.
 */
export async function consumeMagicLink(
  token: string,
  baseUrl: string = DEFAULT_BASE,
  fetchFn: typeof fetch = fetch,
): Promise<MagicLinkConsumeResult> {
  const url = `${baseUrl}/v1/guest-access/consume`;
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch (cause) {
    throw new MagicLinkConsumeError(0, 'unknown', `network: ${(cause as Error).message}`);
  }

  if (res.ok) {
    return (await res.json()) as MagicLinkConsumeResult;
  }

  let body: MagicLinkErrorBody;
  try {
    body = (await res.json()) as MagicLinkErrorBody;
  } catch {
    body = { error: 'unknown', message: 'unexpected response' };
  }
  const code = (body.error ?? 'unknown') as MagicLinkErrorCode;
  throw new MagicLinkConsumeError(res.status, code, body.message ?? 'consume failed');
}
