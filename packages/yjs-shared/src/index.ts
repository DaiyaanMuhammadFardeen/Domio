/**
 * @domio/yjs-shared — Yjs CRDT substrate for Domio.
 *
 * Provides:
 * - **Sub-doc registry** (`SubDocRegistry`) for managing slide/theme
 *   Y.Doc sub-documents within a parent deck doc.
 * - **Schema ↔ CRDT projection** (`ensureSlide`, `serializeSlide`) for
 *   converting between the `@domio/schema` `Slide` type and Yjs CRDT
 *   state.
 * - **Awareness / presence** helpers for real-time collaboration cursors,
 *   selections, and peer tracking.
 * - **Persistence** with an injectable `KeyValueStore` and ring-buffer
 *   eviction, plus an IndexedDB adapter for production.
 */

// Sub-document registry & schema projection
export {
  SubDocRegistry,
  ensureSlide,
  serializeSlide,
  createDeckDocs,
} from './subdocs.js';

// Awareness / presence protocol helpers
export {
  PRESENCE_KEYS,
  CURSOR_PALETTE,
  createAwareness,
  updatePresence,
  getPeers,
  deterministicCursorColor,
  createCursorColorAllocator,
  cursorColorFor,
} from './awareness.js';
export type { PresenceState, Peer } from './awareness.js';

// Persistence
export {
  createIndexedDBStore,
  createMemoryStore,
  PersistenceProvider,
  mergeChunks,
} from './persistence.js';
export type { KeyValueStore, PersistenceOpts } from './persistence.js';
