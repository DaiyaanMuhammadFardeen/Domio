# Phase C — Real per-day sparkline series for Overview

## Context

`apps/dashboard/src/app/overview/page.tsx` fetches real totals from the warehouse
but the **per-day sparkline series** is fabricated:

```ts
const perDay = (total: number): number[] =>
  Array.from({ length: 7 }, (_, i) => Math.round(total / 7 + i));
```

That's a uniform distribution pretending to be a 7-day trend. The KPI tiles
look real but the trend line is invented.

The data the warehouse aggregates into `session_agg` _does_ include
`bucket_ts_ms` (5-minute buckets), so we can roll it up to days server-side.

## Files to change

### 1. `services/analytics-warehouse/src/dao/queries.ts`

Add a new DAO method:

```ts
export interface DailyPoint {
  day: string;            // ISO date "2026-08-10"
  sessions: number;
  viewers: number;
  avg_session_ms: number;
  completion_rate: number;
}

// Add to AnalyticsDao:
dailySessions(scope: QueryScope): Promise<DailyPoint[]>;
```

Implementation:

```sql
SELECT
  toDate(toDateTime64(min(bucket_ts_ms) / 1000, 3)) AS day,
  countDistinct(session_id) AS sessions,
  countDistinct(viewer_id_key) AS viewers,
  avg(duration_ms) AS avg_session_ms,
  avgIf(completed, completed > 0) AS completion_rate
FROM session_agg
WHERE workspace_id = {workspace_id:String}
  AND bucket_ts_ms >= {from_ms:UInt64}
  AND bucket_ts_ms <  {to_ms:UInt64}
GROUP BY day
ORDER BY day ASC
```

> Note: `session_agg` here is the underlying `SummingMergeTree` table, not
> `session_agg_mv` (the materialized view). Use the underlying table so reads
> skip the MV fan-out cost.

### 2. `services/analytics-warehouse/src/routes/analytics.ts`

Add `GET /v1/decks/summary/daily`:

```ts
router.get('/v1/decks/summary/daily', async (req, res) => {
  const { workspace_id, from_ms, to_ms } = req.query as Record<string, string>;
  // ...validate workspace_id, from_ms, to_ms...
  const rows = await dao.dailySessions({
    workspace_id,
    from_ms: Number(from_ms),
    to_ms: Number(to_ms),
  });
  res.json({ rows });
});
```

Return the same `{ rows: [...] }` envelope the other endpoints use.

### 3. `apps/dashboard/src/app/overview/page.tsx`

- Drop the `perDay()` synthetic series.
- Call `/v1/decks/summary/daily` in addition to `/v1/decks/summary`.
- If `rows.length === 0` (no data yet), render the KPI tile without a sparkline
  and a footnote: _"Sparkline requires 7+ days of data"_.
- If `rows.length > 0`, build the per-day series from real data and pass it
  to `OverviewClient`.

### 4. `apps/dashboard/src/app/overview/OverviewClient.tsx`

Accept an optional `series` per KPI and render an empty-state path when it's
missing or all zeros. The current code already accepts a `series` array — just
add a guard.

## Verification

1. With ClickHouse data present (smoke 59/59 should still pass), open
   `http://localhost:3000/overview` — the sparkline shapes must no longer be
   the synthetic uniform ramp.
2. Truncate `session_agg` and reload — sparklines disappear, footnote shows.
3. Re-run smoke: `node tests/beta/smoke.mjs` — must stay 59/59 green.

## Risk / out of scope

- Does NOT yet backfill historical data into `session_agg`. If the table is
  empty, the sparkline is empty. That's correct behavior.
- Does NOT change the four existing tiles' total values, only their series.
- Does NOT touch `dashboard/heatmap/`, `dashboard/ab/`, `dashboard/crm/`, etc.
