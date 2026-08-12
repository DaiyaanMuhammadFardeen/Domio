# Frontend reach — phase-by-phase plan

The monorepo has 80+ backend services and 11 apps. As of late Phase 19,
the only two apps reachable from a real entry point were `editor` and
`dashboard`, and even those had stub fallbacks, invented fallback data,
and a "Phase 0 stub" home page that hid the work that had been built.

This folder holds the plan to make the frontend the actual surface for
the backend. Each phase is a self-contained, stoppable unit of work.

## Read order

Do them in this order. Phases A–E cover the editor + dashboard. F–N
cover the rest of the apps.

| # | Phase | Plan | What it does |
| - | ----- | ---- | ------------ |
| **A** | Editor entry point | [phase-A-editor-entry-point.md](phase-A-editor-entry-point.md) | Rewrite `apps/editor/src/app/page.tsx` from the Phase 0 stub into a deck list + feature catalogue. Wire `?panel=...` into `EditorRoot`. |
| **B** | Wire missing services | [phase-B-wire-services.md](phase-B-wire-services.md) | Add 6 stanzas to `docker-compose.full.yml`: crm-sync, ab-assignment, ab-measurement, ab-statistics, team-analytics, live-analytics. Wire dashboard env URLs. |
| **C** | Real sparkline series | [phase-C-overview-sparklines.md](phase-C-overview-sparklines.md) | Add `dailySessions` DAO + `/v1/decks/summary/daily` route. Drop synthetic `perDay()` in `/overview`. |
| **D** | Replace dashboard stubs | [phase-D-replace-stubs.md](phase-D-replace-stubs.md) | Replace `STUB_*` in `/crm`, `/ab`, `/team`, `/heatmap` with honest empty states. Drop `synthCells()`. |
| **E** | (legacy verify) | [phase-E-verify.md](phase-E-verify.md) | Early verify milestones for editor + dashboard. Superseded by Phase N. |
| **F** | Viewer app | [phase-F-viewer.md](phase-F-viewer.md) | Replace viewer Phase 0 stub. Routes: `/` (code entry), `/v/[token]` (deck), `/embed/[token]` (iframe). |
| **G** | Presenter app | [phase-G-presenter.md](phase-G-presenter.md) | Replace presenter Phase 0 stub. Routes: `/`, `/session/[id]`, `/session/[id]?display=secondary`, `/session/[id]/rehearsal`, `/session/[id]/recap`. |
| **H** | Join-web PWA | [phase-H-join-web.md](phase-H-join-web.md) | Wire JoinForm to navigate. Render live widget stream (poll/qa/quiz/cloud/hand/vote/reaction). |
| **I** | Landing page | [phase-I-landing.md](phase-I-landing.md) | Replace landing Phase 0 stub. Marketing home + features + pricing + changelog. |
| **J** | Magic-link landing | [phase-J-magic-link.md](phase-J-magic-link.md) | Audit + auto-redeem guest invites. Mostly plumbing. |
| **K** | Creator-console home | [phase-K-creator-console.md](phase-K-creator-console.md) | Add `/` route — currently 404s — so users can reach `/listings`, `/analytics`, `/statements`, `/settings`. |
| **L** | Console compose wiring | [phase-L-console-compose-wiring.md](phase-L-console-compose-wiring.md) | Add 14 services to compose: marketplace, creator-analytics, guests, library, suggestions, merge-requests, expiry, calendar, meeting-integration, task-manager, participant-session, audience-service, embed-proxy, permission-engine. |
| **M** | API gateway audit | [phase-M-api-gateway.md](phase-M-api-gateway.md) | Audit `apps/api` mounted routes vs. UI-referenced endpoints. Wire the gaps. |
| **N** | Verify all surfaces | [phase-N-verify.md](phase-N-verify.md) | Smoke 59/59, all 30+ services healthy, Playwright screenshots of every page, full E2E demo. |

## Dependency graph

```
A ──► E (early verify)
B ──► C
B ──► D
F ──► G ──► H ──► N
F ──► L ──► N
F ──► M ──► N
J ──► L
K ──► L
G ──► L
H ──► L
I (independent)
```

Phases A and B can run in parallel. Phases F and I are independent and
can run in parallel with anything else.

## Stopping criteria

After each phase, the stack MUST still pass `node tests/beta/smoke.mjs`
(59/59 green) and the affected services MUST be healthy. If a phase
breaks the smoke, fix it before moving on.

## Out of scope (across all phases)

- Auth — every page is still open. Auth is a separate plan.
- Webhooks — Stripe, Zoom, etc. are not wired.
- Native app wrappers — Capacitor, PWA install, etc.
- The control plane's full surface — only the endpoints the UIs reference
  are wired in Phase M.
