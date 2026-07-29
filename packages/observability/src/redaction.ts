/**
 * PII redaction adapter for the observability SDK.
 *
 * The real implementation lives in `@domio/redact-pii`. We import it
 * lazily through the safe-import shim so that:
 *
 *   - If `@domio/redact-pii` is not installed, the SDK still works
 *     (logs / metrics / spans still flow), just without PII scrubbing.
 *     This protects partial installs and ad-hoc developer experiments.
 *
 *   - If the dependency is present (the normal case in any Domio
 *     runtime), the adapter resolves to the real package and applies
 *     full PII scrubbing before emission.
 *
 * Note: the workspace `tsconfig.base.json` does not declare the
 * `@domio/redact-pii` package as a path alias. The TS package therefore
 * resolves it through pnpm's node_modules layout, which works fine when
 * the package is installed by `pnpm install`.
 */

import { createRequire as nodeCreateRequire } from 'node:module';

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
let lookupFailed = false;

function loadFromNodeModules(): RedactPiiLike | null {
  try {
    const url = (import.meta as { url?: string }).url;
    if (!url) return null;
    const req = nodeCreateRequire(url);
    const mod = req('@domio/redact-pii');
    if (!mod || typeof mod !== 'object') return null;
    const m = mod as Partial<RedactPiiLike>;
    if (typeof m.redactString !== 'function') return null;
    if (typeof m.redactValue !== 'function') return null;
    return {
      redactString: m.redactString as RedactPiiLike['redactString'],
      redactValue: m.redactValue as RedactPiiLike['redactValue'],
      REDACTED_MARKER: m.REDACTED_MARKER ?? '[REDACTED]',
    };
  } catch {
    return null;
  }
}

export function getRedactor(): RedactPiiLike {
  if (cached) return cached;
  if (lookupFailed) return PASS_THROUGH;
  const m = loadFromNodeModules();
  if (m) {
    cached = m;
    return m;
  }
  lookupFailed = true;
  return PASS_THROUGH;
}

export function isRedactionActive(): boolean {
  return getRedactor() !== PASS_THROUGH;
}
