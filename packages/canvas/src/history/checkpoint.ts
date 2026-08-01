/**
 * Checkpoints — named pins in the history timeline. See
 * docs/development_phases/phase-03 §E.1: named checkpoints are pinned
 * history entries.
 */

import type { DeckDocument } from '@domio/schema';

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: number;
  doc: DeckDocument;
}

export class CheckpointRegistry {
  private readonly checkpoints = new Map<string, Checkpoint>();

  create(name: string, doc: DeckDocument, timestamp: number): Checkpoint {
    const id = `ckpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const checkpoint: Checkpoint = { id, name, timestamp, doc: cloneDoc(doc) };
    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  list(): Checkpoint[] {
    return Array.from(this.checkpoints.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  restore(id: string): DeckDocument | null {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) return null;
    return cloneDoc(checkpoint.doc);
  }

  remove(id: string): void {
    this.checkpoints.delete(id);
  }

  findByName(name: string): Checkpoint | null {
    for (const cp of this.checkpoints.values()) {
      if (cp.name === name) return cp;
    }
    return null;
  }

  byId(id: string): Checkpoint | null {
    return this.checkpoints.get(id) ?? null;
  }
}

function cloneDoc(doc: DeckDocument): DeckDocument {
  return JSON.parse(JSON.stringify(doc));
}

export type CheckpointId = string;