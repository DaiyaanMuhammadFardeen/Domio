/**
 * Team-analytics — retention matrix tests (Phase 17 W9).
 *
 * Verifies cohort assignment, day-1/7/30 retention counting, and
 * determinism: feeding the same input twice yields identical output.
 */

import { describe, it, expect } from 'vitest';
import { computeCohorts, type RetentionEvent } from './retention.js';

const day = 24 * 60 * 60 * 1000;

function atIsoDate(iso: string, hour = 12): number {
  return new Date(`${iso}T${String(hour).padStart(2, '0')}:00:00.000Z`).getTime();
}

describe('computeCohorts', () => {
  it('returns an empty array for empty input', () => {
    expect(computeCohorts([])).toEqual([]);
  });

  it('assigns a single viewer to one Monday cohort', () => {
    const events: RetentionEvent[] = [
      { viewer_id_key: 'v1', ts_ms: atIsoDate('2025-01-15') }, // Wednesday
    ];
    const rows = computeCohorts(events);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cohort_week).toBe('2025-01-13'); // Monday before
    expect(rows[0]?.cohort_size).toBe(1);
    expect(rows[0]?.retained_day_1).toBe(0);
  });

  it('counts day-1, day-7, and day-30 retention correctly', () => {
    const cohortDay = atIsoDate('2025-01-06'); // Monday
    const events: RetentionEvent[] = [
      // Viewer A: returns on day 1 only
      { viewer_id_key: 'A', ts_ms: cohortDay },
      { viewer_id_key: 'A', ts_ms: cohortDay + day },
      // Viewer B: returns on day 1 and day 7
      { viewer_id_key: 'B', ts_ms: cohortDay },
      { viewer_id_key: 'B', ts_ms: cohortDay + day },
      { viewer_id_key: 'B', ts_ms: cohortDay + 7 * day },
      // Viewer C: returns on day 30 only
      { viewer_id_key: 'C', ts_ms: cohortDay },
      { viewer_id_key: 'C', ts_ms: cohortDay + 30 * day },
      // Viewer D: never returns
      { viewer_id_key: 'D', ts_ms: cohortDay },
    ];
    const rows = computeCohorts(events);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.cohort_week).toBe('2025-01-06');
    expect(row.cohort_size).toBe(4);
    expect(row.retained_day_1).toBe(2);
    expect(row.retained_day_7).toBe(1);
    expect(row.retained_day_30).toBe(1);
    expect(row.retention_day_1).toBe(0.5);
    expect(row.retention_day_7).toBe(0.25);
    expect(row.retention_day_30).toBe(0.25);
  });

  it('buckets viewers into separate Monday cohorts', () => {
    const events: RetentionEvent[] = [
      { viewer_id_key: 'A', ts_ms: atIsoDate('2025-01-06') }, // Monday — cohort Jan 6
      { viewer_id_key: 'A', ts_ms: atIsoDate('2025-01-07') }, // day 1
      { viewer_id_key: 'B', ts_ms: atIsoDate('2025-01-13') }, // Monday — cohort Jan 13
      { viewer_id_key: 'B', ts_ms: atIsoDate('2025-01-20') }, // day 7
    ];
    const rows = computeCohorts(events);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cohort_week).toBe('2025-01-06');
    expect(rows[0]?.cohort_size).toBe(1);
    expect(rows[0]?.retained_day_1).toBe(1);
    expect(rows[1]?.cohort_week).toBe('2025-01-13');
    expect(rows[1]?.cohort_size).toBe(1);
    expect(rows[1]?.retained_day_7).toBe(1);
  });

  it('is deterministic for the same input', () => {
    const events: RetentionEvent[] = [
      { viewer_id_key: 'A', ts_ms: atIsoDate('2025-01-06') },
      { viewer_id_key: 'A', ts_ms: atIsoDate('2025-01-07') },
      { viewer_id_key: 'B', ts_ms: atIsoDate('2025-01-08') },
    ];
    const r1 = computeCohorts(events);
    const r2 = computeCohorts(events);
    expect(r1).toEqual(r2);
  });

  it('cohort_size is independent of subsequent activity', () => {
    // 100 distinct viewers, all on Jan 6, none return
    const events: RetentionEvent[] = [];
    for (let i = 0; i < 100; i += 1) {
      events.push({ viewer_id_key: `v${i}`, ts_ms: atIsoDate('2025-01-06') });
    }
    const rows = computeCohorts(events);
    expect(rows[0]?.cohort_size).toBe(100);
    expect(rows[0]?.retained_day_1).toBe(0);
    expect(rows[0]?.retained_day_7).toBe(0);
    expect(rows[0]?.retained_day_30).toBe(0);
  });
});
