import type { ServiceDeps } from '../deps.js';
import { signUrl } from '../crypto/index.js';

// ---------------------------------------------------------------------------
// CDN signer worker
// ---------------------------------------------------------------------------

export interface CdnSignerInput {
  sha256: string;
  method?: string;
}

export interface CdnSignerResult {
  url: string;
  expiresAt: number;
}

/**
 * Sign a GET URL for a blob using the CDN signing mechanism.
 * The URL will include the HMAC signature and expiry timestamp.
 */
export function run(
  deps: ServiceDeps,
  { sha256, method = 'GET' }: CdnSignerInput,
): CdnSignerResult {
  const now = deps.now ? deps.now() : Date.now();
  const expiresAt = now + deps.limits.signedUrlTtlMs;
  const path = `${deps.bundleBaseUrl}/blobs/${sha256}`;

  const url = signUrl(method, path, deps.signUrlSecret, expiresAt);

  return { url, expiresAt };
}
