# Frontend Roadmap — README

This folder is the **canonical frontend implementation plan** for Domio.

The goal: **every feature in `feature-list.md` (240 features across 16 sections) must be reachable from a real, production-grade UI surface. No backend capability may exist without a frontend. No dummy data anywhere.**

## How to read this roadmap

1. **Start with [`00-master.md`](./00-master.md).** It defines principles, the master wave plan, the panel-to-feature matrix, and the stub-kill register.
2. **Then read the wave you're implementing.** Each wave doc is self-contained with sub-phases, files to create/modify, build instructions, SOLID notes, scope, and DoD checklist.

## Wave index

| Wave | Doc | Streams unlocked | Status |
|---|---|---|---|
| 1 | [`01-wave-productionization.md`](./01-wave-productionization.md) | Foundational abstractions; kills every existing mock | **Complete** (baseline Lighthouse + bundle deferred to Wave 2; see `wave-1-completion.md`) |
| 2 | [`02-wave-editor-surface.md`](./02-wave-editor-surface.md) | Editor panels + canvas chrome for §1, §2, §3, §4, §5, §6, §7 | Pending |
| 3 | [`03-wave-viewer-publishing.md`](./03-wave-viewer-publishing.md) | Production viewer + share / embed / publish UX | Pending |
| 4 | [`04-wave-presenter-live.md`](./04-wave-presenter-live.md) | Live presenter console + recording export + phone remote | Pending |
| 5 | [`05-wave-audience-participation.md`](./05-wave-audience-participation.md) | Audience widgets + kiosk + translations + consent | Pending |
| 6 | [`06-wave-ai-copilot-ui.md`](./06-wave-ai-copilot-ui.md) | Every AI orchestrator endpoint → UI surface | Pending |
| 7 | [`07-wave-analytics-insights.md`](./07-wave-analytics-insights.md) | Dashboard completeness; real data, no zero-state fallbacks | Pending |
| 8 | [`08-wave-enterprise-governance.md`](./08-wave-enterprise-governance.md) | SSO/SCIM, DLP, audit, residency, legal hold, plugins | Pending |
| 9 | [`09-wave-marketplace-creator.md`](./09-wave-marketplace-creator.md) | Marketplace storefront + creator console | Pending |
| 10 | [`10-wave-agentic-programmable.md`](./10-wave-agentic-programmable.md) | MCP config, webhook tester, API explorer, CLI download | Pending |
| 11 | [`11-wave-novel-frontier.md`](./11-wave-novel-frontier.md) | Knowledge graph, gaze, voice-state, podcast, kiosk, two-way | Pending |
| 12 | [`12-wave-marketing-docs.md`](./12-wave-marketing-docs.md) | Production marketing site + docs + demo gallery | Pending |

## Execution rules

1. **Wave 1 must land first.** Every later wave assumes the panel registry, service layer, design tokens, loading primitives, and typed clients from Wave 1.
2. **After Wave 1, waves can be parallelized** across pods (see master §7) since each works in disjoint `apps/` directories.
3. **No wave can ship with stubbed data.** If a backend endpoint is missing, the wave doc marks it "deferred" and the panel becomes a one-line placeholder linking to a status page, NOT a mock.
4. **SOLID compliance is verified per wave** via the explicit shape patterns in each wave doc (panel registry, service interface, hook pattern, etc.).
5. **Accessibility (WCAG 2.2 AA), i18n, dark/light themes, and performance budgets are non-negotiable** at every wave.

## Master invariants — never violate

- No file under `apps/` may contain a hardcoded array that looks like data.
- No component may import the SDK client directly; it must go through a `*-service.ts`.
- No `fetch(...)` in component or panel code.
- No `window.alert("…will be implemented…")`.
- No `STUB_*` constants.
- No `Coming soon` placeholder pages in production builds.
- Every panel is registered in its app's registry; `EditorRoot`, `PresenterView`, etc. never import panels by name.
- Every widget is registered in its registry; `WidgetRenderer` never special-cases widget kinds.

## Where to ask questions

Open a discussion thread referencing the specific wave + sub-phase ID (e.g. "S2.5 — Theme panel brand extract"). Update the relevant wave doc with the decision so the roadmap stays a living document.
