/**
 * feedback-service — posts audience session feedback.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Replaces the inline fetch in apps/join-web/src/app/feedback/[session_id]/page.tsx.
 */

export interface FeedbackPayload {
  readonly stars: number;
  readonly nps: number;
  readonly note: string;
}

export class FeedbackSubmitError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'FeedbackSubmitError';
  }
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['JOIN_WEB_API_BASE_URL'] ?? '' : '');

/**
 * Submit session feedback. Throws on non-2xx — the caller may choose to
 * surface the error or silently close the form (current behavior just
 * closes the form once the request finishes, regardless of outcome).
 */
export async function submitFeedback(
  sessionId: string,
  payload: FeedbackPayload,
  baseUrl: string = DEFAULT_BASE,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const url = `${baseUrl}/api/feedback/${encodeURIComponent(sessionId)}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new FeedbackSubmitError(res.status, `feedback failed: ${res.status}`);
  }
}
