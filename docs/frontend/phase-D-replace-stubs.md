# Phase D — Replace dashboard stubs with honest empty states

## Context

Even after Phase B wires the backing services, a service can be down. The
dashboard must not show invented data. Today it shows:

- `apps/dashboard/src/app/crm/page.tsx` — STUB_ADAPTERS (HubSpot/Salesforce/Intercom, hardcoded)
- `apps/dashboard/src/app/ab/page.tsx` — STUB_EXPERIMENTS (5 fake experiments)
- `apps/dashboard/src/app/team/page.tsx` — STUB_TEMPLATES / STUB_BRANDS / STUB_RETENTION
- `apps/dashboard/src/app/heatmap/page.tsx` — `synthCells()` radial-falloff canvas

The user must never see those. Replace each with an empty-state UI that
honestly tells them the service is unreachable.

## Files to change

### `apps/dashboard/src/app/crm/page.tsx`

```tsx
async function fetchAdapters(): Promise<{
  rows: Adapter[];
  degraded: boolean;
}> {
  const url = new URL('/v1/health/stats', CRM_SYNC_URL);
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { rows: [], degraded: true };
    const j = await res.json();
    return { rows: j.rows ?? [], degraded: false };
  } catch {
    return { rows: [], degraded: true };
  }
}

export default async function CrmPage() {
  const { rows, degraded } = await fetchAdapters();
  return (
    <div className="space-y-6">
      <header>...</header>
      {degraded && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          CRM sync service is not reachable. Showing empty state. Check Grafana
          / Jaeger for the uptime.
        </div>
      )}
      {rows.length === 0 ? (
        <div className="empty-state">No CRM adapters configured yet.</div>
      ) : (
        <AdapterTable rows={rows} />
      )}
    </div>
  );
}
```

Delete `STUB_ADAPTERS`. Delete the `if (!res.ok) return STUB_ADAPTERS;` branch.

### `apps/dashboard/src/app/ab/page.tsx`

Same shape as CRM. Replace `STUB_EXPERIMENTS` with empty array on failure. Show
"No experiments yet" when the result is empty.

### `apps/dashboard/src/app/team/page.tsx`

Three tables: templates, brands, retention. Replace `STUB_TEMPLATES`,
`STUB_BRANDS`, `STUB_RETENTION` with three empty arrays. Render three
"No team analytics data yet" empty states, each with the relevant service
URL pinned.

### `apps/dashboard/src/app/heatmap/page.tsx`

Drop `synthCells()`. When the heatmap service returns no rows, render:

```
No scroll/heatmap data for this slide yet. Heatmaps are generated as
viewers scroll and pause on the slide.
```

### `apps/dashboard/src/app/heatmap/HeatmapCanvas.tsx`

Accept an `empty?: boolean` prop. When `empty`, render the empty-state message
instead of the canvas. When not empty, render the canvas with the real cells.

## Verification

1. Stop one service (`podman stop domio-crm-sync`) and reload `/crm` — must
   show the "not reachable" badge + empty table, NOT invented adapter data.
2. With all services up, the same pages show real data from each service.
3. `node tests/beta/smoke.mjs` — must stay 59/59 green.

## Risk / out of scope

- Does NOT change the data fetches themselves. It only changes what happens
  when the fetch returns empty or fails.
- Does NOT add an "Add adapter" CTA — that's a separate feature.
- Does NOT yet show the Grafana / Jaeger deep links — the URLs are placeholders
  wired by the env. Operator fills them in.
