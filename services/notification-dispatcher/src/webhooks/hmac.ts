/**
 * Notification dispatcher — HMAC payload signing + verification.
 *
 * Outbound payloads are signed with HMAC-SHA256 and the hex digest
 * is placed in the `X-Domio-Signature` header. Inbound payloads
 * (Slack: `x-slack-signature`, Teams: `x-teams-signature`) are
 * verified using the same algorithm with timing-safe comparison.
 *
 * Environment:
 *   NOTIFICATION_WEBHOOK_SECRET  Signing secret. Falls back to a
 *                                default dev value with a console
 *                                warning if unset.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_DEV_SECRET = 'domio-dev-webhook-secret-do-not-use-in-prod';

/** Lazy-read the secret once; warn if using the default. */
let cachedSecret: string | undefined;
let warned = false;

function getSecret(explicit?: string): string {
  if (explicit) return explicit;
  if (cachedSecret !== undefined) return cachedSecret;

  const envSecret = process.env.NOTIFICATION_WEBHOOK_SECRET;
  if (envSecret) {
    cachedSecret = envSecret;
  } else {
    cachedSecret = DEFAULT_DEV_SECRET;
    if (!warned) {
      warned = true;
      console.log(JSON.stringify({
        msg: 'notification-dispatcher: webhook_secret_using_default',
        warning: 'NOTIFICATION_WEBHOOK_SECRET not set — using default dev secret',
      }));
    }
  }
  return cachedSecret;
}

/**
 * signPayload computes the HMAC-SHA256 hex digest of `body`
 * using the given secret (or the env/default secret).
 */
export function signPayload(secret: string | undefined, body: string): string {
  const s = getSecret(secret);
  return createHmac('sha256', s).update(body, 'utf8').digest('hex');
}

/**
 * verifySignature checks a hex-encoded HMAC-SHA256 signature
 * against the body. Uses timing-safe comparison to prevent
 * timing side-channel attacks.
 *
 * Returns true if the signature matches; false otherwise.
 */
export function verifySignature(
  secret: string | undefined,
  signatureHeader: string,
  body: string,
): boolean {
  const s = getSecret(secret);
  const expected = createHmac('sha256', s).update(body, 'utf8').digest('hex');

  // Both must be the same length for timingSafeEqual.
  if (expected.length !== signatureHeader.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader, 'hex'),
    );
  } catch {
    return false;
  }
}
