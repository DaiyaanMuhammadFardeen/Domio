/**
 * History snapshots — every 5,000 ops, the engine writes a snapshot and
 * prunes older ops on receipt (per docs/development_phases/phase-03 §8
 * history-engine-unbounded-growth mitigation).
 */

import type { DeckDocument } from '@domio/schema';

export interface HistorySnapshot {
  timestamp: number;
  doc: DeckDocument;
  /** Operation ids that are still active after this snapshot. */
  retainedOps: string[];
}

export class SnapshotLog {
  private readonly entries: HistorySnapshot[] = [];

  record(snapshot: HistorySnapshot): void {
    this.entries.push(snapshot);
  }

  latest(): HistorySnapshot | null {
    return this.entries[this.entries.length - 1] ?? null;
  }

  size(): number {
    return this.entries.length;
  }

  list(): HistorySnapshot[] {
    return [...this.entries];
  }
}