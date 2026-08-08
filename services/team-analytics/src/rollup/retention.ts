/**
 * Team-analytics — retention cohort computation (Phase 17 W9).
 *
 * Pure JS implementation used by tests and as a fallback for the
 * ClickHouse retention query. Given a list of (viewer_id_key, ts_ms)
 * events, group them into weekly cohorts anchored on Monday and
 * compute 1/7/30-day retention per cohort.
 *
 * Determinism: input is sorted by ts_ms; the same input always
 * produces the same cohort assignment.
 */

export interface RetentionEvent {
  viewer_id_key: string;
  ts_ms: number;
}

export interface RetentionRow {
  cohort_week: string; // ISO date of the Monday
  cohort_size: number;
  retained_day_1: number;
  retained_day_7: number;
  retained_day_30: number;
  retention_day_1: number;
  retention_day_7: number;
  retention_day_30: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function floorToDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function computeCohorts(events: RetentionEvent[]): RetentionRow[] {
  if (events.length === 0) return [];

  // First-touch per viewer.
  const firstTouch = new Map<string, number>();
  for (const e of events) {
    const existing = firstTouch.get(e.viewer_id_key);
    if (existing === undefined || e.ts_ms < existing) {
      firstTouch.set(e.viewer_id_key, e.ts_ms);
    }
  }

  // Per-viewer set of activity days (epoch-day floor).
  const activityDays = new Map<string, Set<number>>();
  for (const e of events) {
    let set = activityDays.get(e.viewer_id_key);
    if (!set) {
      set = new Set<number>();
      activityDays.set(e.viewer_id_key, set);
    }
    set.add(floorToDay(e.ts_ms));
  }

  // Bucket viewers by their Monday cohort.
  const cohorts = new Map<string, Set<string>>();
  for (const [viewer, firstMs] of firstTouch) {
    const mondayIso = toIsoDate(mondayUtc(new Date(firstMs)));
    let set = cohorts.get(mondayIso);
    if (!set) {
      set = new Set<string>();
      cohorts.set(mondayIso, set);
    }
    set.add(viewer);
  }

  const out: RetentionRow[] = [];
  for (const [cohortIso, viewers] of cohorts) {
    const cohortMonday = new Date(`${cohortIso}T00:00:00.000Z`).getTime();
    let r1 = 0;
    let r7 = 0;
    let r30 = 0;
    for (const v of viewers) {
      const days = activityDays.get(v);
      if (!days) continue;
      // Day 1 = +1d from cohort Monday, day 7 = +7d, day 30 = +30d.
      // A viewer "returns" on day 1 if they had any activity on
      // cohortMonday+1, etc.
      if (days.has(cohortMonday + MS_PER_DAY)) r1 += 1;
      if (days.has(cohortMonday + 7 * MS_PER_DAY)) r7 += 1;
      if (days.has(cohortMonday + 30 * MS_PER_DAY)) r30 += 1;
    }
    const size = viewers.size;
    out.push({
      cohort_week: cohortIso,
      cohort_size: size,
      retained_day_1: r1,
      retained_day_7: r7,
      retained_day_30: r30,
      retention_day_1: size > 0 ? r1 / size : 0,
      retention_day_7: size > 0 ? r7 / size : 0,
      retention_day_30: size > 0 ? r30 / size : 0,
    });
  }
  out.sort((a, b) => (a.cohort_week < b.cohort_week ? -1 : a.cohort_week > b.cohort_week ? 1 : 0));
  return out;
}
