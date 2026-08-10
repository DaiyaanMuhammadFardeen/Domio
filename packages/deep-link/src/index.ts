/**
 * @domio/deep-link — public surface.
 *
 * Phase 10 M7.1. Three layers:
 *   1. StateEncoder / StateDecoder — base64url + HMAC-SHA256 codec.
 *   2. Shortener — short-id namespace + replay-safe click counts.
 *   3. KeyRotator — 30-day rolling rotation with a 7-day overlap.
 *
 * Everything is pure TS / Node `crypto`; no I/O. The service layer
 * (`services/deep-link-svc`) wraps these classes with a Postgres
 * DAL and Hono handlers.
 */

export * from './types.js';
export * from './errors.js';
export {
  StateEncoder,
  StateDecoder,
  encodePayload,
  decodePayload,
  canonicalJson,
  generateKey,
  type StateEncoderOptions,
  type StateDecoderOptions,
} from './state-encoder.js';
export {
  KeyRotator,
  KEY_TTL_MS,
  OVERLAP_MS,
  RETIRE_AFTER_MS,
  type KeyRotationStore,
} from './key-rotation.js';
export { scopeFilter, type ScopeFilterOptions } from './scope-filter.js';