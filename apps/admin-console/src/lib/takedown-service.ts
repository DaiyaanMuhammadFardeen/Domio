/**
 * Takedown service — admin-side takedown queue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Extended in Wave 9 §S9.6 with a detail-fetch + per-request event trail.
 *
 * The admin-console fetcher surfaces `TakedownRequest` objects from the
 * `/v1/takedowns` endpoint. `getTakedown` and `listTakedownEvents` are
 * convenience wrappers around the same fetcher. All endpoints swallow
 * upstream errors and return empty / null so the UI degrades cleanly
 * without a governance service mock.
 */

import { fetcher } from './fetcher';
import type { TakedownRequest } from './types';

export type TakedownEventAction =
  | 'submitted'
  | 'review_started'
  | 'counter_notice'
  | 'confirmed'
  | 'dismissed'
  | 'resolved';

export interface TakedownEvent {
  readonly id: string;
  readonly action: TakedownEventAction;
  readonly actor: string;
  readonly timestamp_ms: number;
  readonly notes?: string;
}

/** Fetches a single takedown by id. Returns null when not found or on error. */
export async function getTakedown(id: string): Promise<TakedownRequest | null> {
  if (!id) return null;
  try {
    return await fetcher<TakedownRequest>(`/v1/takedowns/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/**
 * Fetches the per-request event trail. The upstream may return the events
 * in any order, so callers can rely on this returning them sorted by
 * ascending `timestamp_ms`.
 */
export async function listTakedownEvents(id: string): Promise<ReadonlyArray<TakedownEvent>> {
  if (!id) return [];
  try {
    const json = await fetcher<{ events?: TakedownEvent[] }>(
      `/v1/takedowns/${encodeURIComponent(id)}/events`,
    );
    const events = json.events ?? [];
    return [...events].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  } catch {
    return [];
  }
}
