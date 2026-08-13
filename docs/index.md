# Domio Documentation Index

> **Status:** Full-feature architecture and pre-development planning baseline. This package plans the complete feature set from `feature-list.md`; it is not an MVP specification. Regulatory statements concerning Bangladesh require verification with official sources and local counsel before implementation or launch.

## How to use this package

1. Read [01 — Problem & Product Definition](01-problem-product-definition.md) for product boundaries, personas, principles, and success metrics.
2. Read [02 — Requirements Engineering](02-requirements-engineering.md) as the canonical functional/non-functional requirements and traceability source.
3. Read [03 — UX & Interface Planning](03-ux-interface-planning.md) for user flows, interaction states, accessibility, and information architecture.
4. Read [04 — System Architecture](04-system-architecture.md), then [05 — Data & Database Design](05-data-database-design.md), [06 — Technology Stack](06-technology-stack.md), and [07 — Security Planning](07-security-planning.md) for implementation foundations.
5. Use [08 — Infrastructure & DevOps](08-infrastructure-devops.md), [09 — Testing Strategy](09-testing-strategy.md), and [10 — Project & Team Planning](10-project-team-planning.md) to operationalize delivery.
6. Read [11 — Legal & Compliance (Bangladesh)](11-legal-compliance-bangladesh.md) and [12 — Bangladesh Development Context](12-bangladesh-development-context.md) before selecting hosting, data flows, payments, or localization behavior.
7. Use the feature-domain documents as the detailed design references during implementation.

## Source-of-truth rules

| Concern                                        | Canonical document                                                        | Rule                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Feature scope and testable FR/NFR requirements | [02 — Requirements Engineering](02-requirements-engineering.md)           | New behavior receives a stable FR/NFR identifier and feature-number mapping.                              |
| Product purpose, personas, scope boundaries    | [01 — Problem & Product Definition](01-problem-product-definition.md)     | Architecture and roadmap decisions must trace back to a product principle or user job.                    |
| User behavior and UI states                    | [03 — UX & Interface Planning](03-ux-interface-planning.md)               | Loading, error, offline, conflict, keyboard, and screen-reader behavior are part of the feature contract. |
| Runtime/module boundaries and contracts        | [04 — System Architecture](04-system-architecture.md)                     | Changes to module ownership, events, consistency, or deployment boundaries require an ADR.                |
| Persistent entities and storage ownership      | [05 — Data & Database Design](05-data-database-design.md)                 | Postgres is the control-plane source of truth; derived stores are rebuildable projections.                |
| Security controls and threat treatment         | [07 — Security Planning](07-security-planning.md)                         | No feature is complete until its abuse cases and security verification are documented.                    |
| Feature-specific detailed design               | Domain docs below                                                         | These own implementation detail, schemas, interaction semantics, APIs, and domain acceptance criteria.    |
| Evolving legal interpretation                  | [11 — Legal & Compliance (Bangladesh)](11-legal-compliance-bangladesh.md) | Treat claims as provisional until confirmed by official sources and counsel.                              |

## Feature-range coverage

Every numbered item in `feature-list.md` is represented in the corresponding domain document and traceable in [02 — Requirements Engineering](02-requirements-engineering.md).

| Feature range | Domain                                | Detailed design                                              |
| ------------: | ------------------------------------- | ------------------------------------------------------------ |
|          1–22 | Core Editor & Canvas                  | [editor-canvas.md](editor-canvas.md)                         |
|         23–36 | Components & Template Ecosystem       | [components-templates.md](components-templates.md)           |
|         37–47 | Theming, Branding & Design Systems    | [theming-branding.md](theming-branding.md)                   |
|         48–64 | Live Data & Interactive Charts        | [live-data-charts.md](live-data-charts.md)                   |
|         65–84 | 3D, Motion & Rich Media               | [3d-motion-media.md](3d-motion-media.md)                     |
|         85–95 | Animation & Transition System         | [animation-transitions.md](animation-transitions.md)         |
|        96–107 | Prototyping & Interactivity           | [prototyping-interactivity.md](prototyping-interactivity.md) |
|       108–125 | AI Copilot                            | [ai-copilot.md](ai-copilot.md)                               |
|       126–141 | Presenter Experience                  | [presenter-experience.md](presenter-experience.md)           |
|       142–154 | Audience Participation                | [audience-participation.md](audience-participation.md)       |
|       155–168 | Sharing, Publishing & Deck-as-Website | [sharing-publishing.md](sharing-publishing.md)               |
|       169–178 | Analytics & Engagement Intelligence   | [analytics.md](analytics.md)                                 |
|       179–192 | Collaboration & Workflow              | [collaboration-workflow.md](collaboration-workflow.md)       |
|       193–204 | Enterprise, Governance & Platform     | [enterprise-governance.md](enterprise-governance.md)         |
|       205–219 | Novel & Frontier Features             | [novel-frontier.md](novel-frontier.md)                       |
|       221–240 | Agentic & Programmable Interfaces     | [agentic-interfaces.md](agentic-interfaces.md)               |

The source list has no item numbered 220; the documentation preserves that numbering so external references remain stable.

## Architecture decision summary

- **Control plane:** modular monolith organized by business capability, with explicit internal contracts and an outbox/event boundary so high-load modules can be extracted later. Implemented in TypeScript on Node 22 + Hono.
- **Realtime gateway:** independent Go service for CRDT presence, stage fan-out, audience channels, and presenter signaling. Speaks gRPC to the control plane only.
- **CPU workers:** independently scalable pools in Go (primary) or Rust (via ADR) for rendering, exports, media transcodes, and CPU-bound data transforms.
- **AI/data workers:** TypeScript primary; Python allowed for ML/eval and dataset prep.
- **Contract rule:** every polyglot boundary speaks gRPC internally and REST+OpenAPI externally. Protobuf, OpenAPI, and JSON Schema are committed sources of truth. Generated clients are committed. No service imports another service's source code. This makes the polyglot structure cheap to maintain and easy to evolve per tier.
- **Deck source of truth:** versioned structured deck schema (JSON Schema/YAML-compatible) and semantic element IDs. The visual editor, deck-as-code mode, MCP, export, viewer, and analytics projections consume the same canonical model.
- **Collaboration:** local-first client editing with a CRDT operation layer, durable append-only operation history, snapshots, optimistic UI, and deterministic reconnect/reconciliation.
- **Storage:** multi-tenant Postgres for authoritative metadata and transactional state; S3-compatible object storage for media/render artifacts; Redis/Valkey for ephemeral coordination; event bus for asynchronous work; columnar analytics storage for engagement events; search and graph projections for semantic queries.
- **Security:** tenant isolation, RBAC plus scoped ABAC, short-lived capability tokens, vault-managed credentials, sandboxed plugins/embeds/code, signed webhooks, append-only audit events, DLP, encryption, and residency-aware routing.
- **Extensibility:** versioned component prop schemas, plugin manifests, connector adapters, public APIs, MCP capability discovery, CLI, and an embeddable local-first engine. No domain module may depend directly on a vendor-specific storage or model API.
- **Degradation:** editing, presenting, and viewing have explicit offline/reduced-functionality modes. Derived services may be unavailable without corrupting the canonical deck.

## Cross-cutting implementation checklist

Before a feature is considered complete, verify:

- It has a feature-number mapping and FR/NFR IDs.
- Its canonical data and derived projections are identified.
- Its API, event, idempotency, authorization, and audit behavior are specified.
- Empty, loading, error, offline, reconnect, conflict, accessibility, and localization states are designed.
- It has unit/property, integration/contract, end-to-end, visual, performance, security, and data-privacy tests appropriate to its risk.
- It has observability: structured events, metrics, traces, dashboards, and actionable alerts.
- It is compatible with deck versioning, branches/merges, sharing policies, data residency, export, and agent/MCP permissions where applicable.
- Product, legal, security, and accessibility approvals are recorded for high-risk changes.
