/**
 * History engine — unlimited undo/redo with named entries. See
 * docs/development_phases/phase-03 §E.1.
 */

import type { DeckDocument } from '@domio/schema';
import { applyOp, type HistoryOp } from './ops.js';

export interface HistoryEntry {
  op: HistoryOp;
  appliedAt: number;
}

export interface HistoryEngineOptions {
  /** Op-count threshold after which a snapshot is recorded. */
  snapshotEvery?: number;
  /** Optional clock. */
  now?: () => number;
}

export class HistoryEngine {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private doc: DeckDocument;
  private readonly options: Required<HistoryEngineOptions>;
  /** Optional listeners notified on `apply` / `undo` / `redo`. */
  private listeners: Array<(event: HistoryEvent) => void> = [];

  constructor(doc: DeckDocument, options: HistoryEngineOptions = {}) {
    this.doc = doc;
    this.options = {
      snapshotEvery: options.snapshotEvery ?? 5_000,
      now: options.now ?? Date.now,
    };
  }

  apply(op: HistoryOp): DeckDocument {
    this.doc = applyOp(this.doc, op);
    this.past.push({ op, appliedAt: this.options.now() });
    this.future.length = 0;
    this.emit({ kind: 'apply', op });
    return this.doc;
  }

  /** Apply an op forward without recording it in the timeline. */
  applyEphemeral(op: HistoryOp): DeckDocument {
    this.doc = applyOp(this.doc, op);
    return this.doc;
  }

  undo(): DeckDocument | null {
    const entry = this.past.pop();
    if (!entry) return null;
    const inverse: HistoryOp = {
      ...entry.op,
      id: entry.op.id,
      name: entry.op.name,
      timestamp: entry.op.timestamp,
      forward: entry.op.inverse,
      inverse: entry.op.forward,
    };
    this.doc = applyOp(this.doc, inverse);
    this.future.push(entry);
    this.emit({ kind: 'undo', op: entry.op });
    return this.doc;
  }

  redo(): DeckDocument | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.doc = applyOp(this.doc, entry.op);
    this.past.push(entry);
    this.emit({ kind: 'redo', op: entry.op });
    return this.doc;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Returns the document as it currently stands. */
  current(): DeckDocument {
    return this.doc;
  }

  /** Past entries in chronological order. */
  pastEntries(): HistoryEntry[] {
    return [...this.past];
  }

  /** Future entries (for the timeline). */
  futureEntries(): HistoryEntry[] {
    return [...this.future];
  }

  size(): number {
    return this.past.length;
  }

  onEvent(listener: (event: HistoryEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Returns the doc as it stood after `targetIndex` entries from now. Used
   * by the scrub UI for previews without committing.
   */
  previewAt(targetIndex: number): DeckDocument | null {
    if (targetIndex < 0 || targetIndex > this.past.length) return null;
    if (targetIndex === this.past.length) return this.doc;
    if (targetIndex > this.past.length) {
      // Looking into the future.
      const overshoot = targetIndex - this.past.length;
      if (overshoot > this.future.length) return null;
      let doc = this.doc;
      for (let i = 0; i < overshoot; i++) {
        const future = this.future[this.future.length - 1 - i];
        if (!future) break;
        doc = applyOp(doc, future.op);
      }
      return doc;
    }
    // Looking into the past.
    let doc = this.doc;
    for (let i = 0; i < this.past.length - targetIndex; i++) {
      const past = this.past[this.past.length - 1 - i];
      if (!past) break;
      const inverse: HistoryOp = {
        ...past.op,
        forward: past.op.inverse,
        inverse: past.op.forward,
      };
      doc = applyOp(doc, inverse);
    }
    return doc;
  }

  /**
   * Discards ops up to and including the given id. Used when a snapshot is
   * written and older ops are pruned (per docs/editor-canvas.md §3.4).
   */
  pruneUpTo(opId: string): number {
    const idx = this.past.findIndex((entry) => entry.op.id === opId);
    if (idx < 0) return 0;
    const removed = this.past.splice(0, idx + 1).length;
    return removed;
  }

  private emit(event: HistoryEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type HistoryEvent =
  | { kind: 'apply'; op: HistoryOp }
  | { kind: 'undo'; op: HistoryOp }
  | { kind: 'redo'; op: HistoryOp };