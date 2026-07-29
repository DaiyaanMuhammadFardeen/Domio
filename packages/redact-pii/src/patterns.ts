/**
 * Redaction patterns.
 *
 * Each pattern returns a `replace` function that takes the matched string
 * and returns a stable replacement token. Patterns are kept small and
 * defensive — never lie about hits, never explode on Unicode, never walk
 * huge inputs.
 */

export type Replacer = (match: string, ...groups: string[]) => string;

export interface Pattern {
  id: string;
  regex: RegExp;
  replace: Replacer;
}

const HEX64 = '[a-fA-F0-9]{64}';
const HEX40 = '[a-fA-F0-9]{40}';

/* Email addresses — RFC 5322 is enormous; we use a pragmatic subset that
 * covers 99% of production logs without catastrophic backtracking. */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;

/* International phones. Bangladesh +880 and 01x local formats, plus the
 * standard E.164 number. We deliberately require the `+` for international
 * to keep false positives low. */
const BD_PHONE_INTL = /\+880\d{10}\b/g;
const BD_PHONE_LOCAL = /\b01[3-9]\d{8}\b/g;
const E164_PHONE = /\+\d{8,15}\b/g;

/* Bangladesh NID: 10 / 13 / 17 digits. The plain `\d{10}` regex matches
 * anything; we look for it as a standalone token to keep false positives
 * low in dashboards. */
const NID_RE = /\b\d{10}\b|\b\d{13}\b|\b\d{17}\b/g;

/* Credit card shape with Luhn validation. */
const CC_RE = /\b(?:\d[ -]?){13,19}\b/g;

/* Common secret formats. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_RE = new RegExp(`\\b(?:Bearer\\s+)?(?:[A-Za-z0-9_-]{32,}|${HEX64})\\b`, 'g');
const AWS_KEY_RE = new RegExp(`\\bAKIA[0-9A-Z]{16}\\b`, 'g');
const STRIPE_RE = /\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{16,}\b/g;
const OPENAI_RE = /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g;
const ANTHROPIC_RE = /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g;
const GIT_SHA_RE = new RegExp(`\\b${HEX40}\\b`, 'g');

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SECRET_KEY_NAMES = /(api[_-]?key|access[_-]?token|password|secret|token|auth|jwt|bearer|cookie|set-cookie|authorization)/i;
void GIT_SHA_RE; // reserved for future git-sha redaction

export const PATTERNS: Pattern[] = [
  {
    id: 'email',
    regex: EMAIL_RE,
    replace: () => '[redacted:email]',
  },
  {
    id: 'phone-bd-intl',
    regex: BD_PHONE_INTL,
    replace: () => '[redacted:phone-bd]',
  },
  {
    id: 'phone-bd-local',
    regex: BD_PHONE_LOCAL,
    replace: () => '[redacted:phone-bd]',
  },
  {
    id: 'phone-e164',
    regex: E164_PHONE,
    replace: (m) => (m.startsWith('+880') ? '[redacted:phone-bd]' : '[redacted:phone]'),
  },
  {
    id: 'nid-bd',
    regex: NID_RE,
    replace: () => '[redacted:nid-bd]',
  },
  {
    id: 'credit-card',
    regex: CC_RE,
    replace: (m) => (luhnValid(stripCredit(m)) ? '[redacted:cc]' : m),
  },
  {
    id: 'jwt',
    regex: JWT_RE,
    replace: () => '[redacted:jwt]',
  },
  {
    id: 'aws-key',
    regex: AWS_KEY_RE,
    replace: () => '[redacted:aws-key]',
  },
  {
    id: 'stripe-key',
    regex: STRIPE_RE,
    replace: () => '[redacted:stripe-key]',
  },
  {
    id: 'openai-key',
    regex: OPENAI_RE,
    replace: () => '[redacted:openai-key]',
  },
  {
    id: 'anthropic-key',
    regex: ANTHROPIC_RE,
    replace: () => '[redacted:anthropic-key]',
  },
  {
    id: 'bearer',
    regex: BEARER_RE,
    replace: () => '[redacted:bearer]',
  },
  {
    id: 'ipv4',
    regex: IPV4_RE,
    replace: (m) => (isPublicIPv4(m) ? '[redacted:ip]' : m),
  },
  // Note: isPublicIPv4 returns true for public, routable IPs. The redact
  // function above replaces public IPv4 with [redacted:ip]. Private/loopback
  // IPs are kept intact so internal log lines remain debuggable.
];

/** Test-only: use patterns without the IP-allowlist (everything redacted). */
export const ALL_IP_PATTERNS: Pattern[] = PATTERNS.map((p) =>
  p.id === 'ipv4' ? { ...p, replace: () => '[redacted:ip]' } : p,
);

/** Stable token for re-marking already-redacted content (idempotency). */
export const REDACTED_TOKEN_RE = /\[redacted:[a-z0-9_-]+\]/g;

function stripCredit(s: string): string {
  return s.replace(/[ -]/g, '');
}

function luhnValid(s: string): boolean {
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  // Private, loopback, link-local, and unspecified ranges are not treated as
  // PII: they cannot identify a subscriber on the public internet.
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 0) return false;
  if (a >= 224) return false; // multicast / reserved
  return true;
}

export function redactString(input: string, opts: { allIPs?: boolean } = {}): string {
  if (typeof input !== 'string') return input;
  let out = input;
  const patterns = opts.allIPs ? ALL_IP_PATTERNS : PATTERNS;
  for (const p of patterns) {
    out = out.replace(p.regex, (match, ...rest) => p.replace(match, ...rest));
  }
  return out;
}

export function looksLikeSecretKey(key: string): boolean {
  return typeof key === 'string' && SECRET_KEY_NAMES.test(key);
}

export const SECRET_KEY_NAME_TEST = SECRET_KEY_NAMES;

export { luhnValid, isPublicIPv4 };