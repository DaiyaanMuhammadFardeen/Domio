/**
 * Scroll service — captures the viewer's scroll-through events.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty event list. The analytics-sink-svc client
 * will replace this in a later wave.
 */

export interface ScrollEvent {
  readonly deckId: string;
  readonly slideIndex: number;
  readonly dwellMs: number;
  readonly capturedAtMs: number;
}

export const BOOTSTRAP_SCROLL_EVENTS: ReadonlyArray<ScrollEvent> = [];

export async function listScrollEvents(_deckId: string): Promise<ReadonlyArray<ScrollEvent>> {
  return BOOTSTRAP_SCROLL_EVENTS;
}
