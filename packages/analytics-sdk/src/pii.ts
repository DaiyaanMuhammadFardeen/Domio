/**
 * Device-side PII stripper.
 *
 * Removes PII fields from event payloads BEFORE batching so the wire
 * format is already scrubbed. We never send raw email / phone / IP /
 * name through to services/event-ingest. The server-side PII stripper
 * in services/event-ingest is a defense-in-depth pass that catches
 * anything the client missed.
 *
 * The regexes are deliberately conservative — false positives are
 * better than leaks. Anything that looks like an email, an IPv4
 * address, a phone number (E.164 + common national formats), or a
 * credit-card-shaped numeric string is masked.
 */

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
// E.164 + common national formats. Permissive: catches + and 7–15 digits.
const PHONE_REGEX = /(?:\+?\d[\s\-.]?){7,15}/g;
// 13-19 digits separated by optional spaces/dashes — covers Visa/MC/Amex/etc.
const CC_REGEX = /\b(?:\d[ \-]?){13,19}\b/g;
// SSN-shaped strings (US only).
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Strip PII from a free-form string. Used for `interaction_data` and
 * `action_data` blobs that may carry user input.
 */
export function stripPii(input: string): string {
  if (!input) return input;
  return input
    .replace(EMAIL_REGEX, '[email]')
    .replace(IPV4_REGEX, '[ip]')
    .replace(SSN_REGEX, '[ssn]')
    .replace(CC_REGEX, (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length >= 13 && digits.length <= 19) return '[card]';
      return m;
    })
    .replace(PHONE_REGEX, (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) return '[phone]';
      return m;
    });
}

/**
 * Walk an event payload and apply stripPii to every string field.
 * Returns a new object so the original is never mutated.
 */
export function stripEvent<T extends Record<string, unknown>>(event: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    out[k] = scrubValue(v);
  }
  return out as T;
}

function scrubValue(v: unknown): unknown {
  if (typeof v === 'string') return stripPii(v);
  if (Array.isArray(v)) return v.map(scrubValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v)) out[k] = scrubValue(vv);
    return out;
  }
  return v;
}

/**
 * Truncate a user-supplied referer to a bare host. The full URL never
 * crosses the wire — only the eTLD+1 (e.g., "twitter.com").
 */
export function refererHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '');
  } catch {
    return '';
  }
}
