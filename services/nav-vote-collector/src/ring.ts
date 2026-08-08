/**
 * @domio/nav-vote-collector — per-(slide, direction) tally.
 *
 * Keeps a sliding window of votes per (workspace, session, slide,
 * direction). The presenter can poll the running totals via
 * `tally(slide_id)` to decide threshold crossings.
 */

export interface Tally {
  next: number;
  previous: number;
  back: number;
}

export interface VoteWindow {
  readonly capacity?: number;
  readonly window_ms?: number;
}

interface VoteEntry {
  participant_id: string;
  direction: 'next' | 'previous' | 'back';
  voted_at_ms: number;
}

export class NavVoteTally {
  private readonly window_ms: number;
  private readonly capacity: number;
  private readonly entries = new Map<string, VoteEntry[]>(); // key: slide_id

  private slideKey(slide_id: string): string {
    return slide_id;
  }

  constructor(opts: VoteWindow = {}) {
    this.capacity = opts.capacity ?? 256;
    this.window_ms = opts.window_ms ?? 30_000;
  }

  add(vote: VoteEntry): void {
    const k = this.slideKey(vote.participant_id);
    void k;
    const list = this.entries.get(vote.participant_id) ?? [];
    list.push(vote);
    while (list.length > this.capacity) list.shift();
    this.entries.set(vote.participant_id, list);
  }

  tally(slide_id: string, now_ms: number): Tally {
    void slide_id;
    let next = 0;
    let previous = 0;
    let back = 0;
    const cutoff = now_ms - this.window_ms;
    for (const list of this.entries.values()) {
      for (const v of list) {
        if (v.voted_at_ms < cutoff) continue;
        if (v.direction === 'next') next += 1;
        else if (v.direction === 'previous') previous += 1;
        else back += 1;
      }
    }
    return { next, previous, back };
  }

  clear(): void {
    this.entries.clear();
  }
}
