/**
 * @domio/phone-pairing — public surface.
 *
 * Phase 15 W6: phone-as-remote pairing with short-lived signed tokens.
 *
 * Public exports:
 *  - `PhonePairingService`, `PhonePairingServiceOptions`
 *  - `PairingStore`, `InMemoryPairingStore`, `makePairingStoreError`
 *  - `TokenSigner`, `mintPairingToken`, `verifyPairingToken`,
 *    `parsePairingToken`, `isExpired`
 *  - Domain types: `PairingRecord`, `PairingTokenClaims`, etc.
 *  - Errors: `PairingError`, `PairingTokenExpiredError`,
 *    `PairingTokenRevokedError`, `PairingTokenReplayedError`,
 *    `PairingSignatureError`, `PairingSessionMismatchError`
 */

export * from './types.js';
export * from './token.js';
export * from './store/store.js';
export * from './store/mem_store.js';
export * from './service.js';
