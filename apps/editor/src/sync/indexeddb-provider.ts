/**
 * IndexedDB persistence provider for the sync sub-doc set.
 *
 * Each Y.Doc's updates are stored as append-log chunks in IndexedDB
 * under the 'domio/yjs' database. On load, chunks are merged via
 * `mergeChunks` from yjs-shared to reconstruct each sub-doc's state.
 *
 * This is similar to y-indexeddb but scoped to our sub-doc architecture.
 */

import * as Y from 'yjs';
import {
  PersistenceProvider,
  createIndexedDBStore,
  createMemoryStore,
  mergeChunks,
  type KeyValueStore,
} from '@domio/yjs-shared';
import type { DeckSubDocs } from './subdocs.js';

// ----- IndexedDB persistence provider for deck sub-docs -----

export interface IndexedDBProviderOptions {
  /** Database name. @default 'domio/yjs' */
  dbName?: string;
  /** Store name. @default 'updates' */
  storeName?: string;
}

export class IndexedDBProvider {
  private readonly persistence: PersistenceProvider;
  private readonly store: KeyValueStore;
  private readonly cleanupFns: Array<() => void> = [];

  constructor(options: IndexedDBProviderOptions = {}) {
    // Use in-memory store for test environments, IndexedDB for production
    if (typeof globalThis.indexedDB !== 'undefined') {
      this.store = createIndexedDBStore(options.dbName, options.storeName);
    } else {
      this.store = createMemoryStore();
    }
    this.persistence = new PersistenceProvider(this.store);
  }

  /**
   * Bind a DeckSubDocs to this provider. Watches for Y.Doc changes
   * and persists updates. Also loads existing state from IndexedDB.
   */
  async bind(subdocs: DeckSubDocs): Promise<void> {
    // Load persisted state for each slide sub-doc
    for (const [key, doc] of subdocs.slideDocs) {
      const subDocKey = `slide:${subdocs.deckRoot.guid}:${key}`;
      const updates = await this.persistence.loadAll(subDocKey);
      if (updates.length > 0) {
        const merged = mergeChunks(updates);
        Y.applyUpdate(doc, merged);
      }

      // Watch for future changes
      const handler = (update: Uint8Array, _origin: unknown) => {
        void this.persistence.persistSubDocUpdate(subDocKey, update);
      };
      doc.on('update', handler);
      this.cleanupFns.push(() => {
        doc.off('update', handler);
      });
    }

    // Persist the deck root doc
    const deckRootKey = `deckRoot:${subdocs.deckRoot.guid}`;
    const deckUpdates = await this.persistence.loadAll(deckRootKey);
    if (deckUpdates.length > 0) {
      const merged = mergeChunks(deckUpdates);
      Y.applyUpdate(subdocs.deckRoot, merged);
    }

    const deckHandler = (update: Uint8Array, _origin: unknown) => {
      void this.persistence.persistSubDocUpdate(deckRootKey, update);
    };
    subdocs.deckRoot.on('update', deckHandler);
    this.cleanupFns.push(() => {
      subdocs.deckRoot.off('update', deckHandler);
    });
  }

  /** Remove all persisted data. */
  async clear(): Promise<void> {
    await this.persistence.clear();
  }

  /** Cleanup watchers. */
  destroy(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
  }
}
