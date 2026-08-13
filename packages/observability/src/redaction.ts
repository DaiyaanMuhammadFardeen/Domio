/**
 * PII redaction adapter for the observability SDK.
 *
 * The real implementation lives in `@domio/redact-pii`. We resolve it
 * via a layered lookup so the SDK stays usable when:
 *
 *   - The package is built (production) — CJS require works.
 *   - The package is reachable via workspace symlinks (test runs) —
 *     we use dynamic ESM import which Vite/Node both understand and
 *     which follows `.ts` source through.
 *   - The package is missing entirely (partial install) — logs/metrics
 *     still flow without scrubbing; the SDK never throws.
 *
 * The first successful lookup is cached; the hot path stays alloc-free.
 */

export interface RedactPiiLike {
  redactString: (s: string, opts?: { redactAddresses?: boolean }) => string;
  redactValue: <T>(v: T, opts?: { redactAddresses?: boolean }) => T;
  REDACTED_MARKER: string;
}

const PASS_THROUGH: RedactPiiLike = Object.freeze({
  redactString: (s: string) => s,
  redactValue: <T>(v: T) => v,
  REDACTED_MARKER: '[REDACTED]',
});

let cached: RedactPiiLike | undefined;

/**
 * Build a `RedactPiiLike` adapter from the real `@domio/redact-pii`
 * module shape. The real package exports `redactString` and `redactPII`;
 * it does not export `REDACTED_MARKER`. We synthesize the marker as
 * `'[redacted:'` (the prefix used by every pattern) so consumers that
 * grep for the marker still work, and we wrap `redactPII` to expose it
 * as `redactValue` so attribute scrubbing is identical to body scrubbing.
 */
function coerce(mod: unknown): RedactPiiLike | null {
  if (!mod || typeof mod !== 'object') return null;
  const m = mod as Partial<RedactPiiLike> & {
    default?: unknown;
    redactPII?: <T>(v: T, opts?: Record<string, unknown>) => T;
    REDACTED_TOKEN_RE?: RegExp;
  };
  const inner = (m.redactString ? m : m.default) as
    | (Partial<RedactPiiLike> & {
        redactPII?: <T>(v: T, opts?: Record<string, unknown>) => T;
      })
    | undefined;
  if (!inner || typeof inner.redactString !== 'function') return null;
  const redactString = inner.redactString.bind(inner) as RedactPiiLike['redactString'];
  const redactPII = inner.redactPII;
  const redactValue: RedactPiiLike['redactValue'] =
    typeof redactPII === 'function'
      ? <T>(v: T, opts?: { redactAddresses?: boolean }) =>
          redactPII(v, opts as Record<string, unknown>)
      : <T>(v: T) => v;
  return {
    redactString,
    redactValue,
    REDACTED_MARKER: '[redacted:',
  };
}

/**
 * Asynchronously resolve the real @domio/redact-pii implementation.
 * Callers should call this once at startup and then await any
 * dependent tests. The first successful resolution is cached; later
 * calls return the cached redactor synchronously.
 *
 * @returns the active redactor (real or PASS_THROUGH fallback).
 */
export async function ensureRedactor(): Promise<RedactPiiLike> {
  if (cached) return cached;
  // Strategy 1: dynamic ESM import. Vite (vitest) and modern Node both
  // understand `.ts` source imports through this path. The dep is
  // listed in package.json so the resolver finds it from a workspace
  // symlink too.
  try {
    const mod = await import(
      /* webpackIgnore: true */
      '@domio/redact-pii'
    );
    const c = coerce(mod);
    if (c) {
      cached = c;
      return c;
    }
  } catch {
    // Strategy 2: try CJS require. Only succeeds for a built (`.js`)
    // package, but it's cheap to attempt and covers a production layout
    // where the workspace dep was prebuilt.
    try {
      const url = (import.meta as { url?: string }).url ?? '';
      if (url) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeModule = require('node:module') as { createRequire: (u: string) => NodeRequire };
        const req = nodeModule.createRequire(url);
        const mod = req('@domio/redact-pii') as unknown;
        const c = coerce(mod);
        if (c) {
          cached = c;
          return c;
        }
      }
    } catch {
      // fall through
    }
  }
  cached = PASS_THROUGH;
  return PASS_THROUGH;
}

/**
 * Synchronous accessor. Falls back to PASS_THROUGH if `ensureRedactor`
 * hasn't been awaited yet. Once the cached redactor is populated by a
 * background `ensureRedactor()` call, future sync calls return it.
 */
export function getRedactor(): RedactPiiLike {
  return cached ?? PASS_THROUGH;
}

export function isRedactionActive(): boolean {
  return getRedactor() !== PASS_THROUGH;
}
