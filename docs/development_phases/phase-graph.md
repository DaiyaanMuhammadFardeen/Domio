# Phase Graph — Dependency Visualization

> **Purpose:** single-page view of all 23 phases and their dependencies. Use this to identify critical path, parallel workstreams, and bottlenecks at a glance.

## High-level dependency graph

```mermaid
flowchart TD
    P00[Phase 00<br/>Repo, contracts, dev env] --> P01[Phase 01<br/>Observability, CI/CD, infra]
    P00 --> P02[Phase 02<br/>Deck schema & scene graph]
    P01 --> P02
    P02 --> P03[Phase 03<br/>Canvas editor MVP]
    P03 --> P04[Phase 04<br/>CRDT & presence]
    P04 --> P05[Phase 05<br/>Persistence, version, branches]

    P05 --> P06[Phase 06<br/>Components & templates]
    P05 --> P07[Phase 07<br/>Theming & brand]
    P05 --> P08[Phase 08<br/>Live data & charts]
    P05 --> P09[Phase 09<br/>Animation & transitions]
    P05 --> P10[Phase 10<br/>Prototyping & interactivity]
    P05 --> P11[Phase 11<br/>3D & rich media]
    P05 --> P12[Phase 12<br/>AI copilot foundation]
    P05 --> P13[Phase 13<br/>Agentic & MCP]

    P06 --> P14[Phase 14<br/>Sharing & publishing]
    P06 --> P15[Phase 15<br/>Presenter experience]
    P06 --> P19[Phase 19<br/>Marketplace]

    P07 --> P14
    P07 --> P15
    P07 --> P19

    P08 --> P15
    P08 --> P16[Phase 16<br/>Audience participation]
    P09 --> P15
    P09 --> P14
    P10 --> P15
    P10 --> P16
    P11 --> P15
    P11 --> P14

    P12 --> P15
    P12 --> P17[Phase 17<br/>Analytics]
    P12 --> P18[Phase 18<br/>Collaboration]
    P13 --> P15
    P13 --> P18

    P14 --> P20[Phase 20<br/>Security & enterprise]
    P15 --> P20
    P16 --> P20
    P17 --> P20
    P18 --> P20
    P19 --> P20

    P14 --> P21[Phase 21<br/>Novel & frontier]
    P15 --> P21
    P16 --> P21
    P17 --> P21
    P18 --> P21

    P21 --> P22[Phase 22<br/>Polish, scale, GA]

    P20 -.continuous.-> P22
    P205[Phase 20.5<br/>Beta security hardening] -.beta-launch gate.-> P14
    P205 -.beta-launch gate.-> P15
    P205 -.beta-launch gate.-> P16
    P205 -.beta-launch gate.-> P17
    P205 -.beta-launch gate.-> P18
    P205 -.beta-launch gate.-> P19
    P205 -.subset of.-> P20

    P22b[Phase 22-beta<br/>Public-beta hardening] -.public-beta gate.-> P14
    P22b -.public-beta gate.-> P15
    P22b -.public-beta gate.-> P16
    P22b -.public-beta gate.-> P17
    P22b -.public-beta gate.-> P18
    P22b -.public-beta gate.-> P19
    P22b -.extends.-> P22
```

## Critical path

```
P00 → P01 → P02 → P03 → P04 → P05 → P14 → P20 → P21 → P22
```

The critical path is ~10 phases long. Every other phase hangs off this spine as a parallel branch.

## Parallel stream map

After phase 05 ships, the work splits into six parallel streams plus the cross-cutting security/enterprise track:

```mermaid
flowchart LR
    subgraph Foundation[Critical path]
        F[P00–P05]
    end

    subgraph StreamA[Stream A — Ecosystem]
        A1[P06 Components]
        A2[P07 Theming]
        A3[P19 Marketplace]
    end

    subgraph StreamB[Stream B — Data & motion]
        B1[P08 Live data]
        B2[P09 Animation]
    end

    subgraph StreamC[Stream C — Interactive media]
        C1[P10 Prototyping]
        C2[P11 3D & media]
    end

    subgraph StreamD[Stream D — AI & agents]
        D1[P12 AI copilot]
        D2[P13 Agentic/MCP]
    end

    subgraph StreamE[Stream E — Live experience]
        E1[P14 Sharing]
        E2[P15 Presenter]
        E3[P16 Audience]
    end

    subgraph StreamF[Stream F — Insights & workflow]
        F1[P17 Analytics]
        F2[P18 Collaboration]
    end

    subgraph Cross[Cross-cutting]
        X1[P20 Security & enterprise]
    end

    F --> StreamA
    F --> StreamB
    F --> StreamC
    F --> StreamD
    StreamA --> StreamE
    StreamB --> StreamE
    StreamC --> StreamE
    StreamD --> StreamF
    StreamE --> StreamF
    StreamA --> StreamF
    Cross -.continuous.- F
    Cross -.continuous.- StreamA
    Cross -.continuous.- StreamB
    Cross -.continuous.- StreamC
    Cross -.continuous.- StreamD
    Cross -.continuous.- StreamE
    Cross -.continuous.- StreamF
```

## Cross-phase contract dependencies

Most phases share contracts defined in earlier phases. The minimum contract surface each phase must respect:

| Phase | Consumes contracts from | Produces contracts consumed by |
|---|---|---|
| 00 | (none) | `contracts/proto/domio/v1/common.proto`, `contracts/openapi/v1/health.yaml`, repo conventions |
| 01 | 00 | CI/CD pipeline, telemetry SDK, infra Terraform modules, container images |
| 02 | 00, 01 | `contracts/schema/deck.schema.json`, `contracts/schema/scene-graph.schema.json`, `packages/schema` |
| 03 | 02 | canvas packages, scene-graph render pipeline |
| 04 | 03 | CRDT protocol, presence channel |
| 05 | 03, 04 | versioning events, branch/merge API |
| 06 | 05 | component prop schema, marketplace listing events |
| 07 | 05 | design token schema, theme API, brand extraction events |
| 08 | 05 | data source adapter interface, query gateway, snapshot API |
| 09 | 05 | timeline schema, animation preset library |
| 10 | 05 | variable store, interaction schema, deep-link state codec |
| 11 | 05 | model asset API, render/embed API |
| 12 | 05 | AI job/run API, citation schema |
| 13 | 05, 12 | MCP tool surface, deck-as-code YAML schema, agent audit events |
| 14 | 06, 07, 11 | share-link API, export-job API |
| 15 | 06, 07, 08, 09, 10, 11, 13 | presenter session API, stage signaling, recap API |
| 16 | 15 | audience session API, poll/Q&A APIs |
| 17 | 14, 15, 16 | analytics event schema, dashboard query API |
| 18 | 05, 13 | comment/approval/MR APIs |
| 19 | 06, 07, 20 | marketplace billing & payout events |
| 20 | (all) | governance, DLP, audit, residency APIs |
| 20.5 | 00, 01, 03, 05 | policy-engine API, audit-event API, dlp-warn API, rate-limit middleware; gates public beta |
| 21 | (most) | novel state timeline, gaze/voice consent APIs, knowledge graph API |
| 22 | (all) | (closes gaps) |

## Bottleneck watch

The most likely bottlenecks:

- **Phase 02 (deck schema).** Everything depends on it. If the schema is wrong, every later phase re-plays its data migration. Mitigate with a schema review board and an internal "schema freeze" before phase 03 starts.
- **Phase 04 (CRDT).** Real-time collab is the hardest technical milestone and blocks parallel streams that need live presence (#142 audience, #126 presenter). Mitigate by de-risking with a spike in phase 00 or 02.
- **Phase 14 (sharing).** Many streams converge here. The publishing pipeline is also where revenue, compliance, and CDN meet. Mitigate by limiting the phase 14 scope to "minimum publishable deck" and deferring polish.
- **Phase 20 (security & enterprise).** This runs continuously, but enterprise pilots cannot start without it. Mitigate by setting an "enterprise-ready" gate earlier than "GA".
- **Phase 20.5 (beta security hardening).** This is the beta-launch cut of P20 and must complete before public signup opens. It is a subset of P20's application-security work; the rest (SSO/SCIM, residency, DLP hard-blocks, audit hash chain, etc.) is deferred to full P20 after product-market fit.

## Critical-path minimization

If the team must ship something demonstrable faster:

- **Minimum Demo 1 (end of P03):** single-user editor with one slide, autosave, no collab.
- **Minimum Demo 2 (end of P05):** multi-user collab with version history, no AI, no data.
- **Minimum Demo 3 (end of P14 + P15):** publish a deck, present it with phone remote. This is the smallest "design partner" deliverable.
- **Minimum Demo 4 (end of P22):** GA.

The phases are organized so a small team (3–5 engineers) can reach Demo 1 inside one quarter, Demo 2 inside two quarters, Demo 3 inside three quarters, and GA inside ~1.5–2 years.
