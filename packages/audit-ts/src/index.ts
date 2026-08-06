/**
 * @domio/audit-ts — public surface.
 *
 * Phase 14 W1. Used by services/share-api (and later every P14
 * workstream that emits privileged-action audit events).
 *
 * Public exports:
 *  - `Chain` — signer + verifier.
 *  - `computeEventHash` — standalone event hash.
 *  - `canonicalize`, `canonicalizeValue` — deterministic JSON serializer.
 *  - `Event`, `Key`, `BuildInput`, `ChainState`, `ChainOptions`,
 *    `JsonObject`, `JsonArray`, `JsonValue`, `JsonPrimitive` — types.
 *  - `GenesisHash`, `HMAC_KEY_BYTES` — constants.
 *  - Errors: `ErrKeyNotFound`, `ErrKeyExpired`, `ErrKeyInvalidSize`,
 *    `ErrNoActiveKey`, `ErrHashMismatch`, `ErrChainMismatch`,
 *    `ErrSequenceGap`.
 */

export * from './canonical.js';
export * from './chain.js';
