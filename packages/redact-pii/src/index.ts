import {
  PATTERNS,
  REDACTED_TOKEN_RE,
  redactString,
  looksLikeSecretKey,
  luhnValid,
  isPublicIPv4,
} from './patterns.js';

const MAX_DEPTH = 32;
const MAX_STRING = 100 * 1024;

/**
 * Recursively redact a value. Does not mutate the input. Honors cycles.
 *
 * - Strings: run through the regex patterns.
 * - Objects: redact keys whose name looks like a secret, redact string values.
 * - Arrays: redact each element.
 * - Dates / Errors / Buffers: returned as-is (their string representation is
 *   not fed through the regex).
 */
export function redactPII<T>(input: T, opts: { allIPs?: boolean } = {}): T {
  return redact(input, new WeakSet(), 0, opts) as T;
}

function redact(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  opts: { allIPs?: boolean },
): unknown {
  if (depth > MAX_DEPTH) return '[redacted:depth]';
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    if (s.length > MAX_STRING) return redactString(s.slice(0, MAX_STRING), opts) + '…[truncated]';
    return redactString(s, opts);
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol' || t === 'function')
    return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Error) {
    const e = new Error(redactString(value.message, opts));
    e.name = value.name;
    if (value.stack) e.stack = redactString(value.stack, opts);
    return e;
  }
  if (value instanceof Buffer) return Buffer.from(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[redacted:cycle]';
    seen.add(value);
    return value.map((v) => redact(v, seen, depth + 1, opts));
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return '[redacted:cycle]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (looksLikeSecretKey(k)) {
        out[k] = '[redacted:secret]';
        continue;
      }
      out[k] = redact(v, seen, depth + 1, opts);
    }
    return out;
  }
  return value;
}

export { PATTERNS, REDACTED_TOKEN_RE, redactString, looksLikeSecretKey, luhnValid, isPublicIPv4 };

export type { Pattern } from './patterns.js';
