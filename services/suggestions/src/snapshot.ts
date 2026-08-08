/**
 * CRDT snapshot isolation (Phase 18 #182).
 *
 * Uses Y.Doc to create an isolated read-only branch snapshot.
 * The snapshot is applied into a sub-doc via Y.applyUpdate,
 * never written back to main.
 */

import * as Y from 'yjs';
import type { SnapshotProvider } from './types.js';

// ---------------------------------------------------------------------------
// In-memory snapshot provider (for tests / dev)
// ---------------------------------------------------------------------------

export class InMemorySnapshotProvider implements SnapshotProvider {
  private readonly snapshots = new Map<string, Uint8Array>();

  setSnapshot(deckId: string, data: Uint8Array, _branchId?: string): void {
    const key = _branchId ? `${deckId}:${_branchId}` : deckId;
    this.snapshots.set(key, data);
  }

  getSnapshot(deckId: string, branchId?: string): Uint8Array {
    const key = branchId ? `${deckId}:${branchId}` : deckId;
    const data = this.snapshots.get(key);
    if (!data) {
      // Return empty state vector as fallback
      return Y.encodeStateVector(new Y.Doc());
    }
    return data;
  }
}

// ---------------------------------------------------------------------------
// Isolated branch doc
// ---------------------------------------------------------------------------

/**
 * Create an isolated read-only Y.Doc from a branch snapshot.
 * The returned doc is a projection — changes to it do NOT affect main.
 */
export function createIsolatedBranch(
  provider: SnapshotProvider,
  deckId: string,
  branchId?: string,
): Y.Doc {
  const snapshot = provider.getSnapshot(deckId, branchId);
  const isolatedDoc = new Y.Doc();
  Y.applyUpdate(isolatedDoc, snapshot);
  return isolatedDoc;
}

/**
 * Encode a Y.Doc's state as a Uint8Array snapshot (for storage).
 */
export function encodeSnapshot(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}
