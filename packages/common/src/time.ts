/**
 * Time utilities. All callers should use these instead of `Date.now()`
 * directly so test seams are obvious.
 */

export function now(): Date {
  return new Date();
}

export function nowMs(): number {
  return Date.now();
}

/** RFC 3339 timestamp string. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function fromIso(s: string): Date {
  return new Date(s);
}

export function elapsedSince(startMs: number, endMs: number = Date.now()): number {
  return endMs - startMs;
}
