/**
 * Chord detection — `G then G` → "go to slide", 1 s timeout (see
 * docs/development_phases/phase-03 §F.1).
 */

export interface ChordState {
  /** Time of the last key press. */
  lastPressAt: number;
  /** Key value of the last key press (uppercase). */
  lastKey: string | null;
  /** Timer handle for the 1 s reset. */
  resetTimer: ReturnType<typeof setTimeout> | null;
}

export function createChordState(): ChordState {
  return { lastPressAt: 0, lastKey: null, resetTimer: null };
}

export interface ChordMatch {
  matched: boolean;
  /** Sequence consumed; the caller should reset the timer. */
  consumed: boolean;
  /** Resolved action id when matched. */
  actionId?: string;
}

export interface ChordDefinition {
  sequence: string[]; // e.g. ["G", "G"]
  actionId: string;
  /** Reset window in ms (default 1000). */
  windowMs?: number;
}

export class ChordMatcher {
  private readonly definitions: ChordDefinition[];
  private state: ChordState = createChordState();
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(definitions: ChordDefinition[], options: { windowMs?: number; now?: () => number } = {}) {
    this.definitions = definitions;
    this.windowMs = options.windowMs ?? 1000;
    this.now = options.now ?? Date.now;
  }

  feed(key: string): ChordMatch {
    const upper = key.toUpperCase();
    const now = this.now();
    if (this.state.lastKey !== upper || now - this.state.lastPressAt > this.windowMs) {
      this.state = { lastPressAt: now, lastKey: upper, resetTimer: null };
      return { matched: false, consumed: false };
    }
    // Second key in a potential sequence.
    for (const def of this.definitions) {
      if (def.sequence.length !== 2) continue;
      if (def.sequence[0] !== this.state.lastKey) continue;
      if (def.sequence[1] !== upper) continue;
      this.state = createChordState();
      return { matched: true, consumed: true, actionId: def.actionId };
    }
    this.state = createChordState();
    return { matched: false, consumed: false };
  }

  reset(): void {
    if (this.state.resetTimer !== null) clearTimeout(this.state.resetTimer);
    this.state = createChordState();
  }
}