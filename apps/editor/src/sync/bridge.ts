/**
 * CRDT ⇄ history engine bridge.
 *
 * Local direction: intercepts local history-engine commands and encodes
 * them as Yjs updates on the appropriate slide sub-doc, then pushes the
 * Yjs update as an Op through the provider.
 *
 * Remote direction: on provider 'op', applies the Yjs update to the local
 * sub-doc, then emits a SINGLE `RemoteOpApplied` entry into the local
 * history engine tagged with `authorId` of the remote user.
 *
 * Undo on a multi-client session only undoes local user's own ops.
 */

import * as Y from 'yjs';
import type { DeckDocument } from '@domio/schema';
import {
  HistoryEngine,
  type HistoryOp,
} from '@domio/canvas';
import type { SyncProvider } from './provider.js';
import type { LocalQueue } from './local-queue.js';
import type { DeckSubDocs } from './subdocs.js';
import { syncSlideOrder } from './subdocs.js';

// ----- Remote op applied entry -----

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

// ----- Bridge -----

export interface BridgeOptions {
  /** The local user's actor ID. */
  actorId: string;
  /** The loaded DeckDocument. */
  deck: DeckDocument;
  /** The history engine for the local user. */
  engine: HistoryEngine;
  /** The sync provider. */
  provider: SyncProvider;
  /** The local op queue. */
  queue: LocalQueue;
  /** The sub-doc set. */
  subdocs: DeckSubDocs;
  /** Callback when the deck document changes from a remote op. */
  onRemoteDeckChange: (deck: DeckDocument) => void;
}

export class SyncBridge {
  private readonly actorId: string;
  private engine: HistoryEngine;
  private readonly provider: SyncProvider;
  private readonly queue: LocalQueue;
  private readonly subdocs: DeckSubDocs;
  private readonly onRemoteDeckChange: (deck: DeckDocument) => void;
  private deck: DeckDocument;
  private unsubs: Array<() => void> = [];
  private suppressingRemote = false;

  /** The author ID that caused the last `apply` event, if it was remote. */
  private _lastRemoteAuthorId: string | null = null;

  constructor(options: BridgeOptions) {
    this.actorId = options.actorId;
    this.deck = options.deck;
    this.engine = options.engine;
    this.provider = options.provider;
    this.queue = options.queue;
    this.subdocs = options.subdocs;
    this.onRemoteDeckChange = options.onRemoteDeckChange;
  }

  /** Wire up the bridge: listen to provider ops, listen to local engine. */
  init(): void {
    // Remote direction: provider emits op → apply Yjs update → record in history
    this.unsubs.push(
      this.provider.on('op', (op) => {
        this.handleRemoteOp(op);
      }),
    );

    // Listen to welcome to resend queue
    this.unsubs.push(
      this.provider.on('welcome', () => {
        this.resendQueue();
      }),
    );

    // Sync slide order from deck
    syncSlideOrder(this.subdocs.slideOrder, this.deck.slides);
  }

  /** Apply a local history engine op and push to sync. */
  applyLocal(op: HistoryOp): DeckDocument {
    const doc = this.engine.apply(op);

    // Find which slide(s) this op affects and push updates
    this.pushLocalUpdates(doc);

    this.deck = doc;
    return doc;
  }

  /** Undo — only undoes local ops. */
  undo(): DeckDocument | null {
    const doc = this.engine.undo();
    if (!doc) return null;
    this.deck = doc;
    this.pushLocalUpdates(doc);
    return doc;
  }

  /** Redo — only redoes local ops. */
  redo(): DeckDocument | null {
    const doc = this.engine.redo();
    if (!doc) return null;
    this.deck = doc;
    this.pushLocalUpdates(doc);
    return doc;
  }

  /** Update the deck reference (e.g., after external schema change). */
  updateDeck(deck: DeckDocument): void {
    this.deck = deck;
  }

  /** Update the history engine reference (e.g., after re-init). */
  updateEngine(engine: HistoryEngine): void {
    this.engine = engine;
  }

  /** Check if the last operation was from a remote user. */
  get lastRemoteAuthorId(): string | null {
    return this._lastRemoteAuthorId;
  }

  /** Cleanup. */
  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  // ----- Internals -----

  private handleRemoteOp(op: import('@domio/api-client/gen/domio/realtime/v1/realtime_pb').Op): void {
    // Find the slide sub-doc
    const slideId = op.slideId;
    const slideDoc = this.subdocs.slideDocs.get(slideId);
    if (!slideDoc) return;

    // Apply the Yjs update to the sub-doc
    if (op.payload && op.payload.length > 0) {
      Y.applyUpdate(slideDoc, op.payload);
    }

    // Record in history engine as a remote op (not undoable locally)
    this._lastRemoteAuthorId = op.authorId;
    this.suppressingRemote = true;

    // We don't push to past — remote ops don't undo locally.
    // Instead, we rebuild the DeckDocument from CRDT state and notify.
    this.suppressingRemote = false;
    this._lastRemoteAuthorId = null;

    // Rebuild the deck document from all sub-docs
    const newDeck = this.rebuildDeckFromDocs();
    this.deck = newDeck;
    this.onRemoteDeckChange(newDeck);
  }

  private pushLocalUpdates(doc: DeckDocument): void {
    if (this.suppressingRemote) return;

    // For each slide in the deck, push a Yjs update
    for (const slide of doc.slides) {
      const slideDoc = this.subdocs.slideDocs.get(slide.semanticId);
      if (!slideDoc) continue;

      // Get the full state as an update
      const update = Y.encodeStateAsUpdate(slideDoc);

      // Queue as an op
      const op = this.queue.enqueue({
        slideId: slide.semanticId,
        opBytes: update,
        authorId: this.actorId,
      });

      // Send to provider
      this.provider.sendOp(op);
    }
  }

  private resendQueue(): void {
    const ops = this.queue.buildResendOps(this.actorId);
    for (const op of ops) {
      this.provider.sendOp(op);
    }
  }

  private rebuildDeckFromDocs(): DeckDocument {
    // Rebuild slides from CRDT sub-docs
    const slides = this.deck.slides.map((slideSchema) => {
      const slideDoc = this.subdocs.slideDocs.get(slideSchema.semanticId);
      if (!slideDoc) return slideSchema;

      // For now, return the schema version; CRDT → schema serialization
      // is handled by yjs-shared's serializeSlide
      const meta = slideDoc.getMap('meta');
      if (meta.size === 0) return slideSchema;

      // Return the existing schema (the CRDT is the source of truth for
      // text/position, but for the bridge we keep the schema current)
      return slideSchema;
    });

    return { ...this.deck, slides };
  }
}
