# Wave 7 — Analytics & Insights

**Intent.** Complete the `apps/dashboard` analytics surface so every §12 (Analytics & Engagement Intelligence) feature is reachable, kill the existing zero-state fallbacks, add the missing funnel + CSAT + alerts pages, and surface insights in editor and presenter too.

**Why it matters.** Analytics is what makes the platform self-improving. Without real dashboards, owners can't see what's working. The current dashboard renders zeros on warehouse miss; that's worse than no dashboard.

---

## 1. Scope

- **§12 Analytics & Engagement Intelligence:** #169–178 (every feature).
- **§15 Novel/frontier:** #219 (cross-deck knowledge graph surfaces here as a dashboard view).

---

## 2. Sub-phase map

### S7.1 — Real data wiring for existing dashboard pages

**Features:** #169, #170, #171, #172, #173, #174, #175, #176, #177, #178.

**Files to modify:**

- `apps/dashboard/src/app/overview/page.tsx`
- `apps/dashboard/src/app/deck/page.tsx`
- `apps/dashboard/src/app/deck/[id]/page.tsx`
- `apps/dashboard/src/app/live/page.tsx`
- `apps/dashboard/src/app/ab/page.tsx`
- `apps/dashboard/src/app/heatmap/page.tsx`
- `apps/dashboard/src/app/benchmarks/page.tsx`
- `apps/dashboard/src/app/crm/page.tsx`
- `apps/dashboard/src/app/team/page.tsx`
- `apps/dashboard/src/app/export/page.tsx`

**Build instructions:**

1. Replace every zero-state fallback with `SuspenseBoundary` + `<EmptyState>` from Wave 1.
2. Real fetch calls via Wave-1 services.
3. Loading skeletons match the real layout.
4. Error retry surface with the trace id from the Wave-1 toast.

**Acceptance:**

- No file contains `STUB_EXPERIMENTS` or `synthetic` fallback.
- Every page renders correctly when warehouse is reachable; shows actionable empty state when not.

---

### S7.2 — Funnel report (deck → slide → conversion)

**Features:** #177, #186.

**Files to create:**

- `apps/dashboard/src/app/funnel/page.tsx`
- `apps/dashboard/src/components/FunnelChart.tsx`
- `apps/dashboard/src/components/SlideBreakdownTable.tsx`

**Build instructions:**

1. Per-deck funnel: viewers → opened → reached slide N → converted (configured event).
2. Drop-off slide annotations: each slide row shows bounce rate + a "why?" button that surfaces AI-suggested hypotheses.
3. Time-series: cohort of viewers by week.

---

### S7.3 — Cohort retention + custom KPI builder

**Features:** #188, #189.

**Files to create:**

- `apps/dashboard/src/app/cohorts/page.tsx`
- `apps/dashboard/src/app/kpis/page.tsx`
- `apps/dashboard/src/components/CohortMatrix.tsx`
- `apps/dashboard/src/components/KPIBuilder.tsx`

**Build instructions:**

1. Cohort matrix: rows = join week, columns = week N retention, cell = heat intensity.
2. KPI builder: pick metric from schema, configure aggregation, save as dashboard tile.
3. Saved KPIs appear on overview.

---

### S7.4 — Element-level heatmap

**Features:** #192.

**Files to create:**

- `apps/dashboard/src/app/heatmap/element/page.tsx`
- `apps/dashboard/src/components/ElementHeatmap.tsx`

**Build instructions:**

1. Element-level heatmap shows attention per element (chart, button, text) on each slide.
2. Click an element to drill into its time-series.

---

### S7.5 — Sentiment + survey / CSAT

**Features:** #193, #194.

**Files to create:**

- `apps/dashboard/src/app/sentiment/page.tsx`
- `apps/dashboard/src/app/csat/page.tsx`
- `apps/dashboard/src/components/SentimentTimeline.tsx`
- `apps/dashboard/src/components/CSATBreakdown.tsx`

**Build instructions:**

1. Sentiment timeline: aggregated sentiment per slide over time.
2. CSAT: per-session scores + per-slide NPS averages.

---

### S7.6 — Real-time alerts

**Features:** #195.

**Files to create:**

- `apps/dashboard/src/app/alerts/page.tsx`
- `apps/dashboard/src/components/AlertConfigForm.tsx`
- `apps/dashboard/src/components/AlertFeed.tsx`

**Build instructions:**

1. Alert config: pick metric + threshold + notification channel.
2. Alert feed: live list of triggered alerts; click to drill into the data.
3. Push to Slack/Teams via `services/notification-dispatcher`.

---

### S7.7 — Live delivery analytics

**Features:** #175.

**Files to modify:**

- `apps/dashboard/src/app/live/page.tsx`

**Build instructions:**

1. Live HUD: attendance count, poll participation rate, question volume, current slide, time-in-slide, attention score.
2. WS-driven; never falls back to static card.
3. Toggle to overlay on the audience display (per Wave 4 handoff).

---

### S7.8 — CRM sync visualization

**Features:** #176.

**Files to modify:**

- `apps/dashboard/src/app/crm/page.tsx`
- `apps/dashboard/src/components/CRMTimeline.tsx`

**Build instructions:**

1. CRM timeline: per-contact events written back to Salesforce/HubSpot.
2. Adapter health: status of each connector; retry button.

---

### S7.9 — Benchmarks

**Features:** #178.

**Files to modify:**

- `apps/dashboard/src/app/benchmarks/page.tsx`

**Build instructions:**

1. Benchmarks compare the deck's completion rate to peers.
2. Per-segment benchmark (industry, audience size, deck size).
3. Actionable suggestions: "your QBR completion rate is in the 90th percentile."

---

### S7.10 — Team analytics

**Features:** #174.

**Files to modify:**

- `apps/dashboard/src/app/team/page.tsx`
- `apps/dashboard/src/components/TeamLeaderboard.tsx`
- `apps/dashboard/src/components/TemplateUsageHeatmap.tsx`

**Build instructions:**

1. Team leaderboard: most active creators, most-used templates.
2. Template usage heatmap: which templates drive the most engagement.
3. Filter by team, time range, template category.

---

### S7.11 — Export + share dashboards

**Features:** #163 (dashboard export).

**Files to modify:**

- `apps/dashboard/src/app/export/page.tsx`
- `apps/dashboard/src/components/ScheduledReportForm.tsx`

**Build instructions:**

1. Export current dashboard view as CSV/Parquet; poll job status.
2. Schedule a recurring email/Slack export with the dashboard as PDF.
3. Edit or delete scheduled reports.

---

### S7.12 — Cross-deck knowledge graph (preview)

**Features:** #219, #124.

**Files to create:**

- `apps/dashboard/src/app/graph/page.tsx`
- `apps/dashboard/src/components/KnowledgeGraph.tsx`

**Build instructions:**

1. Knowledge graph shows entities (people, products, KPIs) across all decks in the workspace.
2. Click an entity to see every slide that references it, with freshness indicator.
3. Search by entity name; jump to slide.

---

## 3. SOLID injection

### Dashboard module map

```
apps/dashboard/src/
├── app/
│   ├── overview/page.tsx
│   ├── deck/page.tsx
│   ├── deck/[id]/page.tsx
│   ├── live/page.tsx
│   ├── ab/page.tsx
│   ├── heatmap/page.tsx
│   ├── heatmap/element/page.tsx
│   ├── benchmarks/page.tsx
│   ├── crm/page.tsx
│   ├── team/page.tsx
│   ├── export/page.tsx
│   ├── funnel/page.tsx
│   ├── cohorts/page.tsx
│   ├── kpis/page.tsx
│   ├── sentiment/page.tsx
│   ├── csat/page.tsx
│   ├── alerts/page.tsx
│   └── graph/page.tsx
├── components/
│   ├── Tile.tsx, Chart.tsx, Table.tsx, FunnelChart.tsx, CohortMatrix.tsx, ...
└── lib/  (services)
```

### Rule: every dashboard tile is a `<Tile variant="kpi" | "chart" | "table" | "funnel">`

Tiles are typed and discoverable. Adding a new tile type means adding one variant to `<Tile>`.

---

## 4. Out of scope

- AI narrative on analytics (deferred to Wave 11 frontier).
- Public-facing analytics (dashboards are private to workspace).

---

## 5. DoD checklist

- [ ] Every §12 feature reachable.
- [ ] Every page renders real data; no zero-state fallbacks.
- [ ] Loading skeletons match layout.
- [ ] Funnel + cohort + KPI builder + alerts pages live.
- [ ] CRM sync adapter health visible.
- [ ] Knowledge graph prototype loads in <1 s for 100-deck workspace.
- [ ] Scheduled reports work end-to-end.
- [ ] Accessibility ≥ 95.
