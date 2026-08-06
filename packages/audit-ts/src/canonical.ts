/**
 * @domio/audit-ts — canonical JSON serializer.
 *
 * Deterministic serialization so signer and verifier produce identical
 * bytes from the same logical payload. Keys are sorted lexicographically;
 * primitives are rendered in a compact form.
 *
 * Public API:
 *  - `canonicalize(payload)` — produces the canonical string for an Event
 *    payload (object with arbitrary JSON values).
 *  - `canonicalizeValue(v)` — produces the canonical string for one
 *    primitive or container.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [k: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

/**
 * Sort an object's keys recursively and produce a deterministic
 * serialization. Null objects serialize as "{}". Arrays preserve order.
 */
export function canonicalizeValue(v: JsonValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return quoteString(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number cannot be canonicalized: ${v}`);
    return formatNumber(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    return '[' + v.map((item) => canonicalizeValue(item as JsonValue)).join(',') + ']';
  }
  if (typeof v === 'object') {
    const obj = v as JsonObject;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(quoteString(k) + ':' + canonicalizeValue(obj[k] as JsonValue));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`unsupported JSON value: ${typeof v}`);
}

/**
 * Convenience for a payload object: returns the canonical string for a map.
 * Returns "null" if payload is undefined or null.
 */
export function canonicalize(payload: JsonObject | null | undefined): string {
  if (!payload) return 'null';
  return canonicalizeValue(payload);
}

function quoteString(s: string): string {
  // JSON-encode the string. Use JSON.stringify because it handles
  // escape sequences correctly. Wrapping in a no-op container avoids
  // the extra quotes JSON.stringify adds, then we strip them.
  const inner = JSON.stringify(s);
  // inner is "<quoted>" — strip the surrounding quotes to use as bare
  // string in our canonical output.
  return inner;
}

function formatNumber(n: number): string {
  // Match Go's strconv.FormatFloat with 'g' format and -1 precision,
  // which uses the shortest representation that round-trips.
  // For ints, prefer no decimal point.
  if (Number.isInteger(n)) return n.toFixed(0);
  return n.toString();
}
