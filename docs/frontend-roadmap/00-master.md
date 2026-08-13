# Frontend Roadmap — Master Plan

**Audience:** Frontend engineering, product, design.
**Goal:** Build a production-grade, accessible, end-user-facing UI for **every** capability the Domio backend exposes. No backend capability may exist without a reachable frontend surface. No dummy data anywhere. Every feature ships behind a panel/route the user can navigate to.

This document is the **master index** for the frontend roadmap. It lists:

1. The **non-negotiable principles** (production-readiness, SOLID, accessibility, etc.).
2. The **master wave plan** — 12 waves, each decomposed into sub-phases.
3. The **panel-to-feature matrix** — every feature in `feature-list.md` mapped to its target UI surface.
4. The **stub-kill register** — every existing mock/dummy/hardcoded data path that must be replaced.

Per-wave detail (high-level build instructions, sub-phases, files to touch) lives in sibling docs:

| Wave | File                                | Streams unlocked                                            |
| ---- | ----------------------------------- | ----------------------------------------------------------- |
| 1    | `01-wave-productionization.md`      | Real backend wiring for editor home + every "stubbed" panel |
| 2    | `02-wave-editor-surface.md`         | Editor panels for §1–§3, §7, §9 of feature-list             |
| 3    | `03-wave-viewer-publishing.md`      | `apps/viewer` production, publishing, embedding             |
| 4    | `04-wave-presenter-live.md`         | `apps/presenter` complete, recording export                 |
| 5    | `05-wave-audience-participation.md` | `apps/join-web` complete, kiosk, translations               |
| 6    | `06-wave-ai-copilot-ui.md`          | Every AI orchestrator endpoint → UI surface                 |
| 7    | `07-wave-analytics-insights.md`     | `apps/dashboard` complete (funnel, CSAT, alerts)            |
| 8    | `08-wave-enterprise-governance.md`  | `apps/admin-console` complete (SSO, DLP, audit, residency)  |
| 9    | `09-wave-marketplace-creator.md`    | `apps/marketplace-web` + `apps/creator-console` end-to-end  |
| 10   | `10-wave-agentic-programmable.md`   | MCP config, webhook tester, API explorer, CLI download      |
| 11   | `11-wave-novel-frontier.md`         | Knowledge graph, gaze, voice-state, podcast export, kiosk   |
| 12   | `12-wave-marketing-docs.md`         | `apps/landing` production marketing site + docs             |

---

## 1. Non-negotiable principles

### 1.1 No-dummy-data rule (production hardening)

- Every list, table, grid, or chart renders data fetched live from the appropriate service. The only fallback permitted is `EmptyState` with a CTA that explains how to create data.
- **All existing mocks must die.** See §4 for the register. After Wave 1, no file may contain a hardcoded array, an inline hardcoded `fetch(...)` returning literals, or a `window.alert("…will be implemented…")`.
- Loading states use a single `<SuspenseBoundary>` with three primitives: skeleton, error-with-retry, empty-with-CTA. No application-specific spinners.
- Every backend call has a typed client (see `packages/sdk-ts`) and the editor hooks read from that client, never reimplement `fetch` inline.

### 1.2 SOLID — single responsibility, open/closed, dependency inversion

These principles are **injected into every phase**, not just an architectural sidebar. Each phase doc states:

- **S — Single responsibility:** One component owns one concern. A panel reads its props, formats its state, and dispatches actions. It does not own transport, persistence, or layout chrome. The `EditorLeftTab` registry is the canonical example: each panel exports `{ id, label, group, icon, Component }` and `EditorRoot` composes them.
- **O — Open/closed:** Adding a new panel / widget / widget-kind never edits `EditorRoot`, never edits the registry runtime, never edits `widget-defs.ts` outside the data array. Adding a new widget kind in Wave 5 means adding one entry to `PARTICIPATION_WIDGETS` plus one renderer switch in `WidgetRenderer`. No `if (kind === 'newKind')` branches scattered across the codebase.
- **L — Liskov substitution:** Panels are interchangeable behind the `EditorPanel` interface. The command palette, the deep-link router, and the marketplace can all open any panel by id without coupling to its concrete component.
- **I — Interface segregation:** Split fat interfaces. `PropsPanel` exposes a narrow `selection`-only surface to the layers panel; the AI orchestrator calls into a narrow `patchTools` interface, not the whole `deck` object.
- **D — Dependency inversion:** Components depend on abstractions in `packages/ui` (e.g. `<Button>`, `<Toast>`, `<CommandPalette>`, `<SuspenseBoundary>`) and abstractions in `packages/sdk-ts` (e.g. `DeckService`, `ShareService`). They never import a concrete HTTP client or React Query.

Concrete patterns this roadmap mandates (referenced in wave docs):

- **Service layer per feature:** `src/lib/<feature>-service.ts` exports typed methods wrapping the generated client. Components import the service; services import the client. No component imports the client directly.
- **Panel registry pattern:** `panels/registry.ts` exports `PANELS: EditorPanel[]`. Each panel is a leaf module. `EditorRoot` reads the registry and never `import`s a panel by name.
- **Widget registry pattern:** Same idea for participation widgets, marketplace listing cards, dashboard tiles. Wave docs reference these by name.
- **Hook surface:** Each feature owns `<feature>Store.ts` (Zustand or React context) with `useXxx()`. Components consume hooks, not stores.

### 1.3 Accessibility, i18n, theming, performance

- WCAG 2.2 AA across every wave. Keyboard-only flow is testable. Screen-reader landmarks for every page.
- i18n through `domio-locale` cookie + `useLocale()` hook + `messages/<locale>.json`. No hardcoded strings in JSX.
- Dark/light theme via CSS variables; every new component must define tokens in `packages/ui/tokens.css`.
- Performance budgets: editor TTI ≤ 2.5 s on cold load (Wave 1 enforces code-split per panel); presenter slide transition ≤ 80 ms; viewer FCP ≤ 1.5 s.

---

## 2. Master wave plan

| Wave                        | Streams                                                                                                                                                                          | Cumulative UI coverage (approx.)                    | Critical path? |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------- |
| 1 — Productionization       | 1.1 replace stubs, 1.2 register panels, 1.3 typed clients, 1.4 design tokens, 1.5 loading primitives, 1.6 test harness                                                           | 0 → 0 (foundational; unblocks all subsequent waves) | **Yes**        |
| 2 — Editor Surface          | 2.1 layers + outline view, 2.2 canvas chrome (rulers/guides), 2.3 themes + brand extract, 2.4 components/registry, 2.5 library + marketplace in editor                           | §1, §2, §3, §7.1, §9.1, §11.1 (≈ 35 features)       | Yes            |
| 3 — Viewer & Publishing     | 3.1 viewer app, 3.2 publishing UX, 3.3 embed playground, 3.4 share controls in editor, 3.5 deck-as-code surface                                                                  | §11 (155–168), §5 partial, §7 partial               | Yes            |
| 4 — Presenter Live          | 4.1 presenter view completeness, 4.2 recording export UI, 4.3 phone remote, 4.4 failover/hand-off, 4.5 LED profiles                                                              | §9 (126–141)                                        | Yes            |
| 5 — Audience Participation  | 5.1 widgets, 5.2 raise-hand, 5.3 captions/translation, 5.4 kiosk, 5.5 consent + a11y                                                                                             | §10 (142–154)                                       | Yes            |
| 6 — AI Copilot UI           | 6.1 outline approval (already exists), 6.2 voice-to-deck, 6.3 designer/redesign, 6.4 copy/translation, 6.5 rehearsal coach UI, 6.6 semantic search, 6.7 layout repair + a11y fix | §8 (108–125)                                        | No (parallel)  |
| 7 — Analytics & Insights    | 7.1 funnel + CSAT + alerts, 7.2 cohort drill-down, 7.3 custom KPIs, 7.4 element-level heatmap, 7.5 sentiment/survey, 7.6 export + share                                          | §12 (169–178)                                       | No (parallel)  |
| 8 — Enterprise & Governance | 8.1 SSO/SCIM, 8.2 DLP, 8.3 audit log viewer, 8.4 residency, 8.5 legal hold, 8.6 plugin admin                                                                                     | §14 (193–204)                                       | No (parallel)  |
| 9 — Marketplace & Creator   | 9.1 listing detail, 9.2 creator console wizard, 9.3 statements + payouts, 9.4 creator analytics, 9.5 reviews + takedowns                                                         | §2 (28–35), §19 (marketplace)                       | No (parallel)  |
| 10 — Agentic & Programmable | 10.1 MCP server config UI, 10.2 webhook subscriptions, 10.3 API explorer, 10.4 CLI download, 10.5 plugin SDK portal, 10.6 rate-limit + spend dashboards                          | §16 (221–236), §15 partial                          | No (parallel)  |
| 11 — Novel & Frontier       | 11.1 knowledge graph, 11.2 gaze highlighting, 11.3 voice-state triggers, 11.4 ambient boardroom, 11.5 deck-to-podcast, 11.6 kiosk, 11.7 two-way slides, 11.8 haptic remote       | §15 (205–219)                                       | No (parallel)  |
| 12 — Marketing & Docs       | 12.1 production landing, 12.2 docs site, 12.3 plugin portal, 12.4 demo videos, 12.5 changelog                                                                                    | Drives adoption                                     | No             |

**Total estimated UI surface:** ~24 panels in editor + ~14 dashboard pages + 8 presenter surfaces + ~14 join-web surfaces + 8 admin surfaces + 6 creator surfaces + 4 viewer surfaces + 4 marketplace surfaces + 4 landing surfaces + 6 docs surfaces = **90+ distinct UI surfaces**, each with multiple states.

---

## 3. Panel-to-feature matrix (target state)

Every row is **a feature that must have a UI in the wave indicated**. Wave docs reference this matrix by feature ID.

| Section                     | Feature IDs | Target UI surface                                                                                                                                                              | Wave    |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| §1 Editor core              | 1–22        | `apps/editor` (panels + canvas chrome)                                                                                                                                         | 1, 2    |
| §2 Components/templates     | 23–35       | `apps/editor` (insert + library + marketplace)                                                                                                                                 | 2       |
| §3 Theming/branding         | 36–47       | `apps/editor` (theme-brand panel, brand-extract subpanel)                                                                                                                      | 2       |
| §4 Live data/charts         | 48–64       | `apps/editor` (data-source + bind-inspector + scenario + filters + threshold panels; live editor + presenter live charts)                                                      | 2, 4    |
| §5 3D / motion / rich media | 65–84       | `apps/editor` (media panel + new 3D subpanel) + `apps/viewer` (3D/video/embeds)                                                                                                | 2, 3    |
| §6 Animation/transitions    | 85–95       | `apps/editor` (animations panel + new motion-path editor)                                                                                                                      | 2       |
| §7 Prototyping              | 96–107      | `apps/editor` (connections + variables + state-inspector + test-sessions + heatmap) + new voice/gesture subpanel                                                               | 2, 6    |
| §8 AI copilot               | 108–125     | `apps/editor` (copilot hub + per-feature subpanels)                                                                                                                            | 6       |
| §9 Presenter                | 126–141     | `apps/presenter` (full surface)                                                                                                                                                | 4       |
| §10 Audience                | 142–154     | `apps/presenter` (widget controls) + `apps/join-web` (renderer) + new kiosk surface                                                                                            | 5       |
| §11 Sharing/publishing      | 155–168     | `apps/viewer` + `apps/editor` (share dialog) + embed playground                                                                                                                | 3       |
| §12 Analytics               | 169–178     | `apps/dashboard` (overview, deck, live, ab, heatmap, benchmarks, crm, team, export) + new funnel/CSAT/alerts pages                                                             | 7       |
| §13 Collaboration           | 179–192     | `apps/editor` (comments, approval, assignment, suggestion, branch, library, expiry) + admin (guests, calendar, task, meeting)                                                  | 1, 2, 8 |
| §14 Enterprise              | 193–204     | `apps/admin-console` (SSO/SCIM, DLP, audit, residency, legal hold, plugins, seats, encryption)                                                                                 | 8       |
| §15 Novel/frontier          | 205–219     | New surfaces — knowledge graph (`/graph`), gaze indicator (presenter), voice-state (presenter), ambient boardroom (presenter), deck-to-podcast (editor export), kiosk (viewer) | 11      |
| §16 Agentic                 | 221–236     | `apps/admin-console/mcp` + new `/api-explorer` + `/webhooks` + `/plugins` + `/cli-download`                                                                                    | 10      |
| §17 Weaving AI / new        | 237–240     | Same as §16 plus `apps/editor` simulation mode panel                                                                                                                           | 6, 10   |

---

## 4. Stub-kill register

These are the **specific existing mocks** that violate the no-dummy-data rule. Wave 1 replaces every one.

| File                                                     | Stub                                           | Replaced by                                           |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `apps/editor/src/components/EditorRoot.tsx`              | `handleNlParse` returns hardcoded tool calls   | Real `POST /v1/ai/nl-patch`                           |
| `apps/editor/src/components/EditorRoot.tsx`              | `handleDeckDiffCompare` returns synthetic diff | Real `POST /v1/diff/deck`                             |
| `apps/editor/src/components/EditorRoot.tsx`              | `SAMPLE_A11Y_FINDINGS`                         | Real `POST /v1/ai/accessibility-audit`                |
| `apps/editor/src/panels/license-dashboard.tsx`           | inline `fetchGrants` array                     | Real `GET /v1/license/grants`                         |
| `apps/editor/src/panels/heatmap-panel.tsx`               | synthetic 16×16 grid                           | Real `GET /v1/analytics/heatmap`                      |
| `apps/editor/src/panels/theme-brand-panel.tsx`           | PHASE_07_BRAND_KITS hardcoded                  | Real `GET /v1/brand/kits`                             |
| `apps/editor/src/panels/data-source-panel.tsx`           | local mocks                                    | Real `GET /v1/connector-framework/sources`            |
| `apps/editor/src/panels/deep-links-panel.tsx`            | in-memory list                                 | Real `GET/POST /v1/deep-links`                        |
| `apps/editor/src/panels/nl-patch-panel.tsx`              | local hardcoded parse                          | Real backend call                                     |
| `apps/editor/src/panels/deck-diff-panel.tsx`             | uses stub `handleDeckDiffCompare`              | Real backend call                                     |
| `apps/editor/src/components/copilot/OutlineApproval.tsx` | approve doesn't persist                        | Real `POST /v1/ai/outline/approve`                    |
| `apps/dashboard/src/app/overview/page.tsx`               | renders zeros                                  | Suspense fallback → real `GET /v1/analytics/overview` |
| `apps/dashboard/src/app/ab/page.tsx`                     | `STUB_EXPERIMENTS`                             | Real `GET /v1/ab/experiments`                         |
| `apps/dashboard/src/app/heatmap/page.tsx`                | synthetic 32×18 grid                           | Real `GET /v1/analytics/heatmap`                      |
| `apps/dashboard/src/app/export/page.tsx`                 | stub URLs                                      | Real export job polling                               |
| `apps/dashboard/src/app/live/page.tsx`                   | static "no live session" card                  | Real WS subscription; no fallback                     |
| `apps/presenter/src/app/page.tsx`                        | link list                                      | Removed; redirect to `/session/[id]`                  |
| `apps/viewer/src/app/page.tsx`                           | "Coming soon"                                  | Replaced by `apps/landing` redirect                   |
| `apps/landing/src/app/page.tsx`                          | "Coming soon"                                  | Wave 12 production marketing site                     |
| `apps/creator-console/src/app/listings/create/page.tsx`  | "actual upload is not yet implemented"         | Real `POST /v1/marketplace/listings` upload flow      |
| `apps/creator-console/src/app/statements/page.tsx`       | no Generate button                             | Real `POST /v1/marketplace/statements/generate`       |
| `apps/admin-console/src/app/trust/page.tsx`              | `window.alert("will be implemented")`          | Real `POST /v1/marketplace/trust/{id}/review`         |
| `apps/admin-console/src/app/brand-locks/page.tsx`        | CSV preview only                               | Real `POST /v1/brand-locks/bulk`                      |
| `apps/admin-console/src/app/payouts/page.tsx`            | read-only                                      | Real payout run + edit actions                        |
| `apps/magic-link-landing/src/app/page.tsx`               | hardcoded dev token                            | Real token validation                                 |

---

## 5. How to use this roadmap

1. **Read this master** to internalize the matrix and the wave plan.
2. **Read the per-wave doc** for the wave you are implementing. Each wave doc follows the same template (see §6 below).
3. **Do not start a wave before Wave 1 is merged.** Wave 1 establishes the abstractions (panel registry, service layer, design tokens, loading primitives) that every later wave relies on.
4. **Each sub-phase is independently shippable.** Waves are sequenced by dependency; sub-phases within a wave can be parallelized across multiple engineers.
5. **Quality gates** for every sub-phase are listed in its wave doc (DoD checklist, SOLID compliance, accessibility tests).

---

## 6. Per-wave doc template

Every wave doc is structured as:

1. **Intent & value** — why this wave, what user pain it removes, expected ROI.
2. **Scope** — feature IDs from the matrix.
3. **Sub-phase map** — list of sub-phases, each with:
   - Goal
   - Files to create/modify
   - Build instructions (high-level, instructional, not pseudocode)
   - SOLID notes (which principles this sub-phase must enforce)
   - Acceptance criteria + tests
4. **SOLID injection** — concrete code-shape guidance for that wave.
5. **Out of scope** — explicit deferrals.
6. **DoD checklist** — checkbox list for merge.

This template appears in every wave doc, so engineers can scan quickly.

---

## 7. Roles & responsibilities (suggested)

| Role                   | Owns                                              |
| ---------------------- | ------------------------------------------------- |
| Frontend platform lead | Wave 1 (abstractions, registry, design tokens)    |
| Editor pod             | Wave 2 (panels + canvas chrome)                   |
| Publishing pod         | Wave 3 (viewer + share dialog + embed playground) |
| Live pod               | Wave 4 + 5 (presenter + audience)                 |
| AI pod                 | Wave 6 (copilot UI surfaces)                      |
| Insights pod           | Wave 7 (dashboard)                                |
| Trust & safety pod     | Wave 8 (admin) + Wave 9 (marketplace admin)       |
| Agentic pod            | Wave 10 (MCP/webhooks/API explorer)               |
| Frontier pod           | Wave 11 (novel features)                          |
| Growth pod             | Wave 12 (marketing + docs)                        |

Pods work in parallel after Wave 1. Their code lives in disjoint `apps/` directories; cross-pod contracts go through `packages/sdk-ts` and `packages/ui`.
