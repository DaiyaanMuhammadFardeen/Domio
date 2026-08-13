/**
 * Team-analytics — funnel computation (Phase 17 W9).
 *
 * Pure JS implementation used by tests. Given a sequence of event
 * names and a stream of (viewer_id_key, event_name) records, compute
 * the conversion count for each step relative to the first step's
 * "entered" audience.
 *
 * The funnel is order-sensitive: a viewer is counted at step N only
 * if their FIRST occurrence of step N happened at or after their FIRST
 * occurrence of step N-1. This mirrors the SQL funnel used by the DAO.
 */

export interface FunnelEvent {
  viewer_id_key: string;
  event_name: string;
}

export interface FunnelInput {
  steps: string[];
  events: FunnelEvent[];
}

export interface FunnelStep {
  step_index: number;
  step_name: string;
  entered: number;
  completed: number;
  conversion_rate: number;
}

export function computeFunnel(input: FunnelInput): FunnelStep[] {
  const { steps, events } = input;
  if (steps.length === 0) return [];

  // For each step, find the earliest ts per viewer.
  const firstSeen = new Map<string, Map<string, number>>();
  for (const step of steps) firstSeen.set(step, new Map());

  // We need a single ordered stream to compute first-occurrence.
  // We sort by event_name deterministically (since FunnelEvent
  // doesn't carry ts). That keeps the test deterministic and
  // mirrors the SQL semantics when timestamps are equal.
  const sorted = [...events].sort((a, b) => {
    if (a.event_name === b.event_name) {
      return a.viewer_id_key < b.viewer_id_key ? -1 : 1;
    }
    return a.event_name < b.event_name ? -1 : 1;
  });

  for (const e of sorted) {
    const m = firstSeen.get(e.event_name);
    if (!m) continue;
    if (!m.has(e.viewer_id_key)) m.set(e.viewer_id_key, steps.indexOf(e.event_name));
  }

  // For each step, the "entered" set is the intersection of
  // all prior step audiences — i.e. viewers whose first step-N
  // occurrence happened at or after their first step-(N-1).
  let previousAudience: Set<string> | null = null;
  const rows: FunnelStep[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] ?? '';
    const m = firstSeen.get(step);
    if (!m) {
      rows.push({ step_index: i, step_name: step, entered: 0, completed: 0, conversion_rate: 0 });
      previousAudience = new Set();
      continue;
    }
    const audience = new Set<string>();
    if (previousAudience === null) {
      for (const v of m.keys()) audience.add(v);
    } else {
      for (const v of m.keys()) {
        if (previousAudience.has(v)) audience.add(v);
      }
    }
    rows.push({
      step_index: i,
      step_name: step,
      entered: audience.size,
      completed: audience.size,
      conversion_rate: 0,
    });
    previousAudience = audience;
  }

  // Conversion rate is relative to step 0's audience.
  const firstEntered = rows[0]?.entered ?? 0;
  for (const r of rows) {
    r.conversion_rate = firstEntered > 0 ? r.entered / firstEntered : 0;
  }
  return rows;
}
