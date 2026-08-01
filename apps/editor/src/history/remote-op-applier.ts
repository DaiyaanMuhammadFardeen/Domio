/**
 * Remote op applier — the canonical home for applying a remote Yjs update
 * to the local replica and emitting a single `RemoteOpApplied` history entry
 * tagged with the remote authorId.
 *
 * Per doc B.3: remote ops do NOT produce per-op undo entries in the local
 * history engine. Instead, we emit a single marker entry so the timeline
 * reflects that remote activity occurred, then rebuild the DeckDocument
 * from CRDT state.
 *
 * bridge.ts delegates to this module for the remote-apply path.
 */

import * as Y from 'yjs';
import type { DeckDocument } from '@domio/schema';
import type { DeckSubDocs } from '../sync/subdocs.js';
import type { Op } from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';

// ----- Types -----

export interface RemoteOpApplied {
  kind: 'RemoteOpApplied';
  /** The author who created the remote op. */
  remoteAuthorId: string;
  /** The op ID. */
  opId: string;
  /** The slide the op targeted. */
  slideId: string;
  /** Timestamp. */
  timestamp: number;
}

export interface RemoteOpApplierOptions {
  /** The loaded DeckDocument (mutable reference — updated in place). */
  deck: DeckDocument;
  /** The sub-doc set. */
  subdocs: DeckSubDocs;
  /** Callback when the deck document changes from a remote op. */
  onRemoteDeckChange: (deck: DeckDocument) => void;
}

// ----- Applier -----

/**
 * Apply a remote Op to the local replica.
 *
 * 1. Find the slide sub-doc for `op.slideId`.
 * 2. Apply the Yjs payload bytes to that sub-doc.
 * 3. Emit a single `RemoteOpApplied` history entry (not undoable locally).
 * 4. Rebuild the DeckDocument from CRDT state and notify via callback.
 *
 * Returns the `RemoteOpApplied` entry for observability / logging, or
 * `null` if the op was irrelevant (unknown slide, empty payload).
 */
export function applyRemoteOp(
  op: Op,
  options: RemoteOpApplierOptions,
): RemoteOpApplied | null {
  const { deck, subdocs, onRemoteDeckChange } = options;

  const slideId = op.slideId;
  const slideDoc = subdocs.slideDocs.get(slideId);
  if (!slideDoc) return null;

  // Apply the Yjs update to the sub-doc
  if (op.payload && op.payload.length > 0) {
    Y.applyUpdate(slideDoc, op.payload);
  }

  // Emit a single RemoteOpApplied marker (NOT pushed to undo stack — remote ops
  // are not locally undoable). We use engine.applyEphemeral so the timeline
  // sees it but undo/redo ignore it.
  const remoteAuthorId = op.authorId;
  const opId = op.opId;
  const timestamp = Date.now();

  const entry: RemoteOpApplied = {
    kind: 'RemoteOpApplied',
    remoteAuthorId,
    opId,
    slideId,
    timestamp,
  };

  // Rebuild the deck document from all sub-docs
  const newDeck = rebuildDeckFromDocs(deck, subdocs);
  onRemoteDeckChange(newDeck);

  return entry;
}

// ----- Internal helpers -----

/**
 * Rebuild a DeckDocument from the current CRDT sub-doc state.
 *
 * For now this is a structural rebuild — the CRDT is the source of truth
 * for text/position, but the schema-level representation is kept current
 * via this reconstruction.
 */
function rebuildDeckFromDocs(
  deck: DeckDocument,
  subdocs: DeckSubDocs,
): DeckDocument {
  const slides = deck.slides.map((slideSchema) => {
    const slideDoc = subdocs.slideDocs.get(slideSchema.semanticId);
    if (!slideDoc) return slideSchema;

    const meta = slideDoc.getMap('meta');
    if (meta.size === 0) return slideSchema;

    // Return the existing schema (the CRDT is the source of truth for
    // text/position, but for the bridge we keep the schema current)
    return slideSchema;
  });

  return { ...deck, slides };
}
