/**
 * Deterministic JSON canonicalization for signing.
 *
 * We implement a small subset of RFC 8785 (JCS): keys are sorted, no
 * insignificant whitespace, and Unicode escapes use lowercase hex with
 * 6 digits (\\uXXXX) only for control characters. Numbers use the
 * shortest representation that round-trips.
 *
 * This is intentionally minimal — we don't need every JCS corner case,
 * just enough that signing produces a stable payload for a given object.
 */

const NEEDS_ESCAPE = new Set<string>(['"', '\\']);
const CTRL = /[\x00-\x1f]/g;

export function canonicalize(value: unknown): string {
  return stringify(value);
}

function stringify(v: unknown): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') return canonicalNumber(v as number);
  if (t === 'string') return canonicalString(v as string);
  if (Array.isArray(v)) return '[' + v.map(stringify).join(',') + ']';
  if (t === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return '{' + keys.map((k) => canonicalString(k) + ':' + stringify(obj[k])).join(',') + '}';
  }
  // bigint, symbol, function, undefined -> JSON doesn't allow; treat as null
  return 'null';
}

function canonicalNumber(n: number): string {
  if (!Number.isFinite(n)) throw new TypeError('non-finite number in canonical JSON');
  if (Object.is(n, -0)) return '0';
  return JSON.stringify(n);
}

function canonicalString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (NEEDS_ESCAPE.has(c)) {
      out += '\\' + c;
      continue;
    }
    if (CTRL.test(c)) {
      out += '\\u' + s.charCodeAt(i).toString(16).padStart(4, '0');
      continue;
    }
    out += c;
  }
  return out + '"';
}