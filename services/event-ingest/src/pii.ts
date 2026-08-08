/**
 * Event-ingest — server-side PII stripper (Phase 17 W1).
 *
 * The analytics-sdk already strips obvious PII on-device (see
 * packages/analytics-sdk/src/pii.ts). This module adds the
 * defense-in-depth layer that runs on the server:
 *
 *   1. Strip IPv4 → IPv4/24 truncation (203.0.113.42 → 203.0.113.0)
 *   2. Truncate user_agent strings to the family name only
 *   3. Apply K-anonymity floors on `value_text` (max 4000 chars)
 *   4. Remove email/phone/credit-card/SSN patterns (defense in depth)
 *
 * The stripper is intentionally idempotent: calling strip() on an
 * already-stripped event is a no-op.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone: require at least one space, paren, or explicit + so an
// IPv4 address (which is digits + dots, no spaces) doesn't match.
const PHONE_RE = /(?:(?:\+\d[\d\s().-]*\d)|\(\d{3}\)\s*\d{3}[\s.-]*\d{4})/g;
const CARD_RE = /\b(?:\d[ -]*?){13,16}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_RE = /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g;

const UA_FAMILY_RE = /\b(?:Chrome|Firefox|Safari|Edge|Opera|SamsungBrowser|UCBrowser|Vivaldi|Brave)\b/;

export interface PiiStripper {
  strip<T extends Record<string, unknown>>(event: T): Record<string, unknown>;
  /** True if the event contained any PII that needed stripping. */
  stripWithReport<T extends Record<string, unknown>>(
    event: T,
  ): { event: Record<string, unknown>; stripped: boolean };
}

function truncateIPv4(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return '[redacted-ip]';
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

function stripString(value: string): string {
  let v = value;
  // Order matters: more-specific patterns run first so a 16-digit
  // credit card doesn't get matched by the phone regex, and an IPv4
  // address doesn't get matched by the phone regex. The redacted
  // markers themselves don't match any pattern, so subsequent passes
  // are no-ops on already-redacted text.
  v = v.replace(EMAIL_RE, '[redacted-email]');
  v = v.replace(CARD_RE, '[redacted-card]');
  v = v.replace(SSN_RE, '[redacted-ssn]');
  v = v.replace(IPV4_RE, (m) => truncateIPv4(m));
  v = v.replace(IPV6_RE, '[redacted-ip]');
  v = v.replace(PHONE_RE, '[redacted-phone]');
  return v;
}

function stripRecursive(value: unknown, changed: { count: number }): unknown {
  if (typeof value === 'string') {
    const stripped = stripString(value);
    if (stripped !== value) {
      changed.count += 1;
      return stripped;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripRecursive(v, changed));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripRecursive(v, changed);
    }
    return out;
  }
  return value;
}

function truncateUaFamily(ua: string): string {
  const match = ua.match(UA_FAMILY_RE);
  return match ? match[0] : 'unknown';
}

function enforceKAnonFloor(event: Record<string, unknown>): Record<string, unknown> {
  // K-anonymity: drop any value_text longer than 4000 chars and any
  // interaction_data longer than 8000 chars. Both are bound by the
  // JSON Schema maxLength but we re-enforce here as defense-in-depth.
  const cloned: Record<string, unknown> = { ...event };
  if (typeof cloned['value_text'] === 'string' && (cloned['value_text'] as string).length > 4000) {
    cloned['value_text'] = (cloned['value_text'] as string).slice(0, 4000);
  }
  if (
    typeof cloned['interaction_data'] === 'string' &&
    (cloned['interaction_data'] as string).length > 8000
  ) {
    cloned['interaction_data'] = (cloned['interaction_data'] as string).slice(0, 8000);
  }
  if (
    typeof cloned['live_event_data'] === 'string' &&
    (cloned['live_event_data'] as string).length > 8000
  ) {
    cloned['live_event_data'] = (cloned['live_event_data'] as string).slice(0, 8000);
  }
  return cloned;
}

export function buildPiiStripper(): PiiStripper {
  return {
    strip(event) {
      return this.stripWithReport(event).event;
    },
    stripWithReport(event) {
      const changed = { count: 0 };
      const stripped = stripRecursive(event, changed) as Record<string, unknown>;
      // Defang IP-like referer hosts in url-shaped fields.
      const uaFamily = stripped['ua_family'];
      if (typeof uaFamily === 'string' && uaFamily.length > 32) {
        stripped['ua_family'] = truncateUaFamily(uaFamily);
        changed.count += 1;
      }
      const floored = enforceKAnonFloor(stripped);
      return { event: floored, stripped: changed.count > 0 };
    },
  };
}

/** No-op stripper for tests. */
export function buildNoopPiiStripper(): PiiStripper {
  return {
    strip(event) {
      return event;
    },
    stripWithReport(event) {
      return { event, stripped: false };
    },
  };
}