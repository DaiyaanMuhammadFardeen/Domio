/**
 * Live-analytics — pulse derivation (Phase 17 W10).
 *
 * Given the trailing window of LiveEvents for a session, derive the
 * real-time KPIs that the HUD broadcasts:
 *
 *   - concurrent_viewers     — distinct viewers whose last event was
 *                              a viewer_join and who have not since
 *                              emitted a viewer_leave (within the
 *                              window).
 *   - current_slide_id        — the slide the largest cohort of
 *                              viewers are currently looking at. We
 *                              break ties by most-recent event.
 *   - reaction_count          — cumulative reaction events.
 *   - poll_vote_count         — cumulative poll_vote events.
 *   - last_seq                — highest seq seen.
 *
 * Pure JS so it can be exercised by unit tests. The function is
 * deterministic for a given input sequence (same events → same pulse).
 */

import type { LiveEvent, LivePulse } from '../types.js';

export function derivePulse(
  workspace_id: string,
  session_id: string,
  events: LiveEvent[],
): LivePulse {
  let concurrent = 0;
  let reactions = 0;
  let polls = 0;
  let lastSeq = 0;
  const viewers = new Map<string, 'in' | 'out'>();
  const slideWatchers = new Map<string, { count: number; lastTs: number }>();

  for (const e of events) {
    if (e.seq > lastSeq) lastSeq = e.seq;
    if (e.kind === 'viewer_join' && e.viewer_id_key) {
      viewers.set(e.viewer_id_key, 'in');
    } else if (e.kind === 'viewer_leave' && e.viewer_id_key) {
      viewers.set(e.viewer_id_key, 'out');
    } else if (e.kind === 'reaction') {
      reactions += 1;
    } else if (e.kind === 'poll_vote') {
      polls += 1;
    } else if (e.kind === 'slide_change') {
      const slideId = e.data ?? null;
      if (slideId) {
        const cur = slideWatchers.get(slideId) ?? { count: 0, lastTs: 0 };
        slideWatchers.set(slideId, { count: cur.count + 1, lastTs: e.ts_ms });
      }
    }
  }

  for (const state of viewers.values()) {
    if (state === 'in') concurrent += 1;
  }

  let currentSlideId: string | null = null;
  let bestCount = -1;
  let bestTs = -1;
  for (const [slide, { count, lastTs }] of slideWatchers) {
    if (count > bestCount || (count === bestCount && lastTs > bestTs)) {
      bestCount = count;
      bestTs = lastTs;
      currentSlideId = slide;
    }
  }

  return {
    workspace_id,
    session_id,
    ts_ms: events[events.length - 1]?.ts_ms ?? 0,
    concurrent_viewers: concurrent,
    current_slide_id: currentSlideId,
    reaction_count: reactions,
    poll_vote_count: polls,
    last_seq: lastSeq,
  };
}

/**
 * Aggregate the events in a session into a summary suitable for the
 * `live_session_summary` table. Computes peak concurrent viewers
 * (the maximum concurrent count over time) by replaying the event
 * stream and tracking the running concurrent set.
 */
export interface DerivedSummary {
  started_at_ms: number;
  ended_at_ms: number;
  duration_ms: number;
  peak_concurrent_viewers: number;
  total_events: number;
  total_reactions: number;
  total_poll_votes: number;
  total_annotations: number;
  unique_viewers: number;
  average_dwell_ms: number;
}

export function deriveSummary(events: LiveEvent[]): DerivedSummary {
  if (events.length === 0) {
    return {
      started_at_ms: 0,
      ended_at_ms: 0,
      duration_ms: 0,
      peak_concurrent_viewers: 0,
      total_events: 0,
      total_reactions: 0,
      total_poll_votes: 0,
      total_annotations: 0,
      unique_viewers: 0,
      average_dwell_ms: 0,
    };
  }
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let peak = 0;
  let reactions = 0;
  let polls = 0;
  let annotations = 0;
  let dwellTotal = 0;
  let dwellCount = 0;
  const viewers = new Set<string>();
  const liveSet = new Map<string, 'in' | 'out'>();

  for (const e of sorted) {
    if (e.kind === 'viewer_join' && e.viewer_id_key) {
      liveSet.set(e.viewer_id_key, 'in');
      viewers.add(e.viewer_id_key);
    } else if (e.kind === 'viewer_leave' && e.viewer_id_key) {
      liveSet.set(e.viewer_id_key, 'out');
    } else if (e.kind === 'reaction') {
      reactions += 1;
    } else if (e.kind === 'poll_vote') {
      polls += 1;
    } else if (e.kind === 'annotation') {
      annotations += 1;
    } else if (e.kind === 'heartbeat') {
      // heartbeats carry value_numeric = dwell_ms in the W10 schema.
      if (typeof e.value_numeric === 'number') {
        dwellTotal += e.value_numeric;
        dwellCount += 1;
      }
    }
    let inCount = 0;
    for (const v of liveSet.values()) if (v === 'in') inCount += 1;
    if (inCount > peak) peak = inCount;
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    started_at_ms: first.ts_ms,
    ended_at_ms: last.ts_ms,
    duration_ms: Math.max(0, last.ts_ms - first.ts_ms),
    peak_concurrent_viewers: peak,
    total_events: sorted.length,
    total_reactions: reactions,
    total_poll_votes: polls,
    total_annotations: annotations,
    unique_viewers: viewers.size,
    average_dwell_ms: dwellCount > 0 ? Math.round(dwellTotal / dwellCount) : 0,
  };
}
