## 📜 Planning-context banner

---

> ## ⚠️ Planning context — not a status report
>
> This is the original planning doc for this phase. The **live status of
> every phase** (what's actually shipped today on `master`) lives in
> **[`../../STATUS.md`](../../STATUS.md)**. Do not read this file as a
> status report — read it as the original spec that drove the work.
>
> See **[`../../CONSOLIDATED.md`](../../CONSOLIDATED.md)** for the full
> doc map.

---

# Domio — Development Phases

> **Purpose:** This folder turns the planning package (`/docs/*`) into a sequenced, parallelizable build plan. Every phase produces a **runnable, demoable increment** that ships to an internal environment, with verifiable acceptance. Phases are organized so that the critical-path is short and most feature work runs in parallel after the foundation lands.
>
> **Reading order:** Read this README first. Then read `phase-graph.md` for the visual dependency graph and parallel-stream map. Then read any phase doc.
>
> **Source of truth:** phases reference feature numbers (`#1`–`#219`, `#221`–`#240`) and link back to the planning docs (`/docs/01..12-*` and `/docs/<domain>.md`). A feature is considered "done" only when its phase doc's Definition of Done is met and the feature appears in the **Verification** matrix of the corresponding phase.

---

## Phase index

|       # | Phase                                                        | Critical path?   | Parallelizable?         | Domain docs depended on                                             | Feature ranges        |
| ------: | ------------------------------------------------------------ | ---------------- | ----------------------- | ------------------------------------------------------------------- | --------------------- |
|      00 | Repository, contracts, dev environment                       | yes              | no (foundation)         | `04`, `05`, `06`                                                    | cross-cutting         |
|      01 | Observability, CI/CD, infra baseline                         | yes              | partial (with 00)       | `06`, `07`, `08`                                                    | cross-cutting         |
|      02 | Deck schema & scene-graph foundation                         | yes              | no (foundation)         | `05`, `06`, `editor-canvas`                                         | #1, #22               |
|      03 | Canvas editor — minimum viable editor                        | yes              | no (critical path)      | `editor-canvas`                                                     | #2–#16, #18, #22      |
|      04 | Real-time collaboration & CRDT sync                          | yes              | no (critical path)      | `editor-canvas`, `04`                                               | #17, #19, #21         |
|      05 | Persistence, versioning, branches                            | yes              | no (critical path)      | `editor-canvas`, `05`                                               | #19, #20              |
|      06 | Components & templates ecosystem                             | deepening        | **yes (Stream A)**      | `components-templates`                                              | #23–#36               |
|      07 | Theming, brand & design tokens                               | deepening        | **yes (Stream A)**      | `theming-branding`                                                  | #37–#47               |
|      08 | Live data & interactive charts                               | deepening        | **yes (Stream B)**      | `live-data-charts`                                                  | #48–#64               |
|      09 | Animation & transition system                                | deepening        | **yes (Stream B)**      | `animation-transitions`                                             | #85–#95               |
|      10 | Prototyping & interactivity                                  | deepening        | **yes (Stream C)**      | `prototyping-interactivity`                                         | #96–#107              |
|      11 | 3D, motion & rich media                                      | deepening        | **yes (Stream C)**      | `3d-motion-media`                                                   | #65–#84               |
|      12 | AI copilot foundation                                        | deepening        | **yes (Stream D)**      | `ai-copilot`                                                        | #108–#125             |
|      13 | Agentic & programmable interfaces (MCP, deck-as-code)        | deepening        | **yes (Stream D)**      | `agentic-interfaces`                                                | #221–#240             |
|      14 | Sharing, publishing & deck-as-website                        | surface          | **yes (Stream E)**      | `sharing-publishing`                                                | #155–#168             |
|      15 | Presenter experience                                         | surface          | **yes (Stream E)**      | `presenter-experience`                                              | #126–#141             |
|      16 | Audience participation                                       | surface          | **yes (Stream E)**      | `audience-participation`                                            | #142–#154             |
|      17 | Analytics & engagement intelligence                          | surface          | **yes (Stream F)**      | `analytics`                                                         | #169–#178             |
|      18 | Collaboration & workflow                                     | surface          | **yes (Stream F)**      | `collaboration-workflow`                                            | #179–#192             |
|      19 | Marketplace & creator economy                                | cross-cutting    | **yes (Stream A)**      | `components-templates`, `theming-branding`, `enterprise-governance` | parts of #28, #41     |
|      20 | Security, governance, enterprise                             | cross-cutting    | continuous              | `07`, `enterprise-governance`, `11`                                 | #193–#204             |
|    20.5 | Beta security hardening (app-only subset of P20)             | beta-launch gate | yes (gates public beta) | `07`                                                                | #193a–c, #195a, #196a |
|      21 | Novel & frontier features                                    | frontier         | late                    | `novel-frontier`                                                    | #205–#219             |
| 22-beta | Beta → Public-beta hardening (P21-independent subset of P22) | public-beta gate | yes (gates public-beta) | `07`, `08`, `09`, `11`                                              | #1–#204 + infra       |
|      22 | Polish, scale, hardening, GA                                 | frontier         | last                    | all                                                                 | all gaps              |

The full dependency graph is in `phase-graph.md`.

---

## Conventions every phase follows

Each phase doc is a markdown file named `phase-NN-short-name.md` with this structure:

1. **Header.** Phase number, name, owner(s), critical path flag, parallel stream (if any), and a one-paragraph intent.
2. **Goals.** Three to six bullet outcomes that are user-visible or architecturally meaningful.
3. **Scope.** List of feature numbers in scope; explicit out-of-scope list to prevent drift.
4. **Dependencies.** Upstream phases (must be complete) and downstream phases (this phase unblocks).
5. **Workstreams.** The phase's work broken into streams. Each stream lists:
   - tasks in order,
   - files/packages touched,
   - contracts added or consumed,
   - tests written,
   - Definition of Done.
6. **Architecture & data.** Any new tables, services, modules, contracts, or migrations introduced. References the master docs (`/docs/04-system-architecture.md`, `/docs/05-data-database-design.md`, `/docs/06-technology-stack.md`, etc.).
7. **Verification.** A matrix of acceptance checks: feature → test → expected result → owner.
8. **Risks & open decisions.** Known unknowns, with the proposed mitigation.
9. **Demo.** A concrete demo script that proves the phase is done in an internal environment.
10. **Definition of Done.** A bullet checklist with explicit gates: code merged, contracts versioned, tests pass, telemetry in place, docs updated.

---

## Parallel streams summary

After phases 00–05 (the critical-path foundation) most work proceeds in parallel. The recommended allocation:

- **Stream A — Ecosystem** (4–6 engineers): P06 components, P07 theming, P19 marketplace
- **Stream B — Data & motion** (4–6 engineers): P08 live data, P09 animation
- **Stream C — Interactive media** (4–6 engineers): P10 prototyping, P11 3D & media
- **Stream D — AI & agents** (3–5 engineers): P12 AI copilot, P13 agentic surface
- **Stream E — Live experience** (4–6 engineers): P14 sharing, P15 presenter, P16 audience
- **Stream F — Insights & workflow** (3–4 engineers): P17 analytics, P18 collaboration
- **Cross-cutting** (3–5 engineers): P20 security & enterprise, runs from P01 onwards. P20.5 is the beta-launch cut of P20 (application-security subset); it gates public beta and must be staffed alongside P03–P14.

Total: ~24–35 engineers at peak, with 5–7 engineers required for the foundation (P00–P05).

See `phase-graph.md` for the Mermaid visualization and `parallelization.md` for the rules of engagement between streams.

---

## How to use this folder

- **Project manager:** use the **Verification** matrix of each phase to track progress. Each cell becomes a Jira ticket (or equivalent) before the phase starts.
- **Tech lead:** use the **Workstreams** section to break the phase into 1–3 day tasks. The phase doc is the source of truth for what each task must produce.
- **Engineer:** open the phase doc, find your workstream, follow the task list, update the Definition of Done checklist as you go. If your work crosses streams, raise it in the daily sync before starting.
- **Security/compliance reviewer:** every phase must pass the security gate defined in `/docs/07-security-planning.md` before merging. The relevant checks are summarized in each phase's Verification matrix.
- **Designer/UX:** every deepening and surface phase has a UX workstream that owns wireframes, prototypes, and copy. UX must land before the engineering workstream ships a feature.

---

## Status legend

- **Not started** — phase doc exists, no implementation yet.
- **In progress** — implementation underway; check the Verification matrix for current state.
- **Internal demo passed** — phase passes the Demo script in an internal environment.
- **Design partner demo passed** — phase has been demoed to one or more design partners.
- **Released** — phase is in production for at least one customer.

The recommended target is "Internal demo passed" before moving to the next phase on the critical path, and "Design partner demo passed" before declaring a deepening or surface phase complete.
