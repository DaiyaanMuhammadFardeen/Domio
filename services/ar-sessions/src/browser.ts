/**
 * @domio/ar-sessions — browser-safe entry point.
 *
 * Re-exports only the bits that don't pull in `node:crypto`. The
 * viewer (a Next.js client app) imports from this path so the
 * webpack bundle doesn't try to polyfill `node:crypto` for the
 * browser layer.
 *
 * Allowed:
 *   - buildAudienceUrl / buildQrPayload (pure URL builders)
 *   - The ArSession type so the viewer can type the session record
 *
 * Forbidden here:
 *   - mintToken / verifyToken / rotateToken / generateSecret
 *   - everything in tokens.ts (uses node:crypto)
 *   - SessionService / handlers (server-only)
 */

export {
  buildAudienceUrl,
  buildQrPayload,
  type QrPayload,
  type BuildAudienceUrlOptions,
} from './deeplink.js';

export type { ArSession, ArSessionResponse } from './service.js';
