/**
 * Editor sync module — Phase 04 realtime collaboration.
 *
 * Re-exports all sync components for convenient access from the editor app.
 */

export { SyncProvider, type SyncProviderOptions, type SyncEvents } from './provider.js';
export { LocalQueue, type LocalQueueOptions, type PendingOp } from './local-queue.js';
export { IndexedDBProvider, type IndexedDBProviderOptions } from './indexeddb-provider.js';
export { RemotePresenceProvider, type RemotePresenceProviderOptions, type RemotePeer, type PresenceEvents } from './presence.js';
export { SyncBridge, type BridgeOptions, type RemoteOpApplied } from './bridge.js';
export { createBackoff, type BackoffOptions } from './backoff.js';
export {
  initDeckSubDocs,
  syncSlideOrder,
  reseedSlideDoc,
  serializeAllSlides,
  getSlideDoc,
  docDigest,
  docsConverged,
  type DeckSubDocs,
} from './subdocs.js';
