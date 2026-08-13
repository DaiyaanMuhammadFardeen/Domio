/**
 * @domio/raise-hand-queue — in-memory FIFO queue.
 */

import type { RaiseHand } from './types.js';

export interface QueueOptions {
  readonly default_ttl_ms?: number;
}

interface QueueEntry {
  hand: RaiseHand;
}

export class RaiseHandQueue {
  private readonly hands = new Map<string, QueueEntry>(); // participant_id -> entry
  private readonly byIndex: QueueEntry[] = [];
  private readonly default_ttl_ms: number;

  constructor(opts: QueueOptions = {}) {
    this.default_ttl_ms = opts.default_ttl_ms ?? 5 * 60_000;
  }

  enqueue(hand: RaiseHand): void {
    if (this.hands.has(hand.participant_id)) return;
    this.hands.set(hand.participant_id, { hand: { ...hand, position: this.byIndex.length } });
    this.byIndex.push(this.hands.get(hand.participant_id)!);
  }

  /** Top of the queue, or null if empty. Expires stale hands. */
  head(now_ms: number): RaiseHand | null {
    this.expire(now_ms);
    const first = this.byIndex.find((e) => e.hand.status === 'queued');
    return first ? first.hand : null;
  }

  list(now_ms: number): ReadonlyArray<RaiseHand> {
    this.expire(now_ms);
    return this.byIndex.filter((e) => e.hand.status === 'queued').map((e) => e.hand);
  }

  call(participant_id: string, now_ms: number): RaiseHand | null {
    this.expire(now_ms);
    const e = this.hands.get(participant_id);
    if (!e) return null;
    if (e.hand.status !== 'queued') return null;
    const updated: RaiseHand = {
      ...e.hand,
      status: 'called',
      resolved_at_ms: now_ms,
      version: e.hand.version + 1,
    };
    this.hands.set(participant_id, { hand: updated });
    this.rebuild();
    return updated;
  }

  dismiss(participant_id: string, now_ms: number): RaiseHand | null {
    const e = this.hands.get(participant_id);
    if (!e) return null;
    if (e.hand.status !== 'queued') return null;
    const updated: RaiseHand = {
      ...e.hand,
      status: 'dismissed',
      resolved_at_ms: now_ms,
      version: e.hand.version + 1,
    };
    this.hands.set(participant_id, { hand: updated });
    this.rebuild();
    return updated;
  }

  size(now_ms: number): number {
    this.expire(now_ms);
    return this.byIndex.filter((e) => e.hand.status === 'queued').length;
  }

  private expire(now_ms: number): void {
    const cutoff = now_ms - this.default_ttl_ms;
    let changed = false;
    for (const e of this.byIndex) {
      if (e.hand.status === 'queued' && e.hand.raised_at_ms < cutoff) {
        this.hands.set(e.hand.participant_id, {
          hand: {
            ...e.hand,
            status: 'expired',
            resolved_at_ms: now_ms,
            version: e.hand.version + 1,
          },
        });
        changed = true;
      }
    }
    if (changed) this.rebuild();
  }

  private rebuild(): void {
    let pos = 0;
    this.byIndex.length = 0;
    for (const e of this.hands.values()) {
      if (e.hand.status !== 'queued') continue;
      this.hands.set(e.hand.participant_id, { hand: { ...e.hand, position: pos } });
      this.byIndex.push(this.hands.get(e.hand.participant_id)!);
      pos += 1;
    }
  }

  clear(): void {
    this.hands.clear();
    this.byIndex.length = 0;
  }
}
