# Parallel Streams — Rules of Engagement

> **Purpose:** Define how the six parallel streams (A–F) and the cross-cutting security/enterprise track (P20) coordinate after the foundation (P00–P05) ships. This is the social contract that keeps parallel work from colliding on shared contracts, shared infra, or shared UX.

---

## 1. Why this doc exists

After Phase 05 ships, the work splits into:

- **Stream A — Ecosystem** (4–6 engineers): P06 components & templates, P07 theming & brand, P19 marketplace
- **Stream B — Data & motion** (4–6 engineers): P08 live data & charts, P09 animation & transitions
- **Stream C — Interactive media** (4–6 engineers): P10 prototyping & interactivity, P11 3D & rich media
- **Stream D — AI & agents** (3–5 engineers): P12 AI copilot, P13 agentic & MCP
- **Stream E — Live experience** (4–6 engineers): P14 sharing & publishing, P15 presenter, P16 audience
- **Stream F — Insights & workflow** (3–4 engineers): P17 analytics, P18 collaboration & workflow
- **Cross-cutting** (3–5 engineers): P20 security & enterprise — runs continuously from P01 onwards

These streams share contracts (e.g., `theme.proto` is consumed by Streams A, B, C, D, E), share infra (Postgres, NATS, S3, CDN, fonts), and share UX surfaces (the canvas, the prop panel, the share dialog). Without rules, parallel streams produce inconsistent contracts, fork the schema, or duplicate work. The rules below prevent that.

---

## 2. Ownership and seams

### 2.1 Capability ownership

Each stream owns a durable capability end-to-end (see `/docs/10-project-team-planning.md` §10.0.1). When work crosses capability boundaries, the **owner of the destination capability has the final say** on the contract. The crossing stream proposes, the owning stream ratifies.

| Capability | Owner stream |
|---|---|
| Deck schema, scene graph, canvas | (foundation, P00–P05; thereafter shared by all streams) |
| Components & templates registry | A |
| Theming & brand | A |
| Marketplace billing & payouts | A |
| Live data & charts | B |
| Animation & transitions | B |
| Prototyping & interactivity | C |
| 3D, motion, rich media | C |
| AI copilot | D |
| Agentic interfaces (MCP, deck-as-code) | D |
| Sharing, publishing, deck-as-website | E |
| Presenter experience | E |
| Audience participation | E |
| Analytics & engagement intelligence | F |
| Collaboration & workflow | F |
| Security, governance, enterprise | (cross-cutting) |
| Identity & tenancy | (cross-cutting) |
| Platform infrastructure (gateway, workers, storage) | (cross-cutting) |

### 2.2 Shared seams

Streams do not share source code. Streams share **contracts**. The seams between streams are exclusively:

| Seam | Form | Owner | Consumers |
|---|---|---|---|
| Deck schema | Protobuf + JSON Schema | Foundation | All streams |
| Token registry | `theme-service` gRPC + REST | A | All streams (every render resolves tokens) |
| Component registry | `registry-service` gRPC + REST | A | All streams (charts use smart components; presenter reads props) |
| Live data / query gateway | `data-service` gRPC + REST | B | E (presenter reads scenario values), F (analytics consumes events) |
| MCP tool surface | Protobuf + JSON-RPC | D | External agents + internal automation |
| Sharing / export jobs | `publish-service` gRPC + REST | E | F (analytics on published decks), A (marketplace listings), P20 (DLP) |
| Analytics events | `analytics-service` ingest (OTel) | F | All streams emit; F consumes + projects |
| Audit events | `audit-service` append-only log | P20 | All streams emit; P20 consumes + projects |

No stream imports another stream's source code. Every cross-stream call goes through one of the seams above. (See ADR-ARCH-10 in `/docs/04-system-architecture.md`.)

---

## 3. Rules of engagement

### 3.1 Contract changes

1. **Breaking changes** to any shared seam require an ADR (see `/docs/10-project-team-planning.md` §10.3) and Architecture Council approval.
2. **Backwards-compatible changes** require only a 24-hour review window in `#domio-contracts` Slack channel; silence = consent.
3. **Schema additions** (new optional fields, new RPCs, new endpoints) follow the same 24-hour window.
4. **Deprecations** are announced in `/docs/release-notes/` with a 90-day removal window for public APIs and a 30-day window for internal seams.
5. **Buf breaking-change gate** in CI is non-negotiable; no merge without green.
6. The owning stream of a seam is the **single writer** of the contract; consumers propose additions via PRs to the owning stream's contract repo path.

### 3.2 Database schema changes

1. Postgres migrations live in `apps/api/migrations/` and are owned by the platform team (cross-cutting).
2. **Any new table or column** introduced by a stream must include `tenant_id`, `created_at`, `updated_at`, and the standard audit columns.
3. **Row-Level Security policies** are mandatory for every multi-tenant table; the cross-cutting security team reviews and signs off.
4. **Column drops** are forbidden in the first 12 months of a column's life; use a soft-delete + deprecation window.
5. **Backfills** require a separate migration, a feature flag, and a rollback plan in the PR description.

### 3.3 Event schema changes

1. NATS JetStream subjects are versioned: `<domain>.<entity>.<event>.v<n>`.
2. **Subject additions** are non-breaking (new consumers subscribe to new subjects).
3. **Subject payload breaking changes** require a new subject version (`v2`); the old subject is deprecated for 90 days.
4. **Replays** are stream-owned; a stream needing to replay events from another stream's subject must ask the owner.

### 3.4 Feature flags

1. Every cross-stream feature ships behind a feature flag.
2. Flags are owned by the **destination capability** (e.g., the marketplace billing flag is owned by Stream A even if Stream E emits the trigger).
3. Flags have an owner, an expiry date, and a kill switch.
4. Flag state lives in `feature_flag_service` (Hono + Postgres) with a read-through cache; consumers never bypass it.
5. Flags default `off` in production until a design-partner demo has passed.

### 3.5 Shared UX components

1. The **component library** (`@domio/ui`) is owned by the design-systems team (Stream A support).
2. Stream A delivers the primitive (`Button`, `Dialog`, `Tooltip`, `PropEditor`, `TokenPicker`); consuming streams compose.
3. **Prop additions** to a shared component require a PR with a Figma link and a11y check; Stream A reviews in < 2 business days.
4. **Visual regressions** in shared components block the PR introducing the change.

### 3.6 Telemetry

1. Every cross-stream feature emits OTel spans and structured logs.
2. Metric naming follows `<domain>.<entity>.<verb>` (e.g., `theme.applied.count`, `data.query.duration_ms`).
3. Dashboards are owned by the emitting stream; consumers subscribe to existing dashboards rather than spinning up new ones for the same signal.
4. Alerts with `severity: critical` must have a runbook in `/docs/runbooks/`.

### 3.7 Demo cadence

1. Each stream demos weekly (30 min, Wed 14:00 local).
2. The stream demo is a 15-minute walkthrough + 15-minute cross-stream Q&A.
3. **Cross-stream dependencies surface here**: a stream that needs help from another stream raises it in the demo and tags the owning stream's lead.
4. The Architecture Council attends the demo in rotation (1 principal per week).

---

## 4. Cross-stream coordination rituals

| Ritual | Frequency | Attendees | Purpose |
|---|---|---|---|
| Stream demo | Weekly (Wed 14:00) | All stream leads + architecture council | Surface cross-stream blockers; demo progress |
| Architecture Council | Weekly (Thu 10:00) | Principal architect + affected leads + security/SRE | ADR review; system health |
| Cross-stream sync | Bi-weekly (Mon 11:00) | Stream leads | Coordinate on shared contracts and shared infra capacity |
| Security review | Per phase | Stream lead + security lead | Sign off on phase security gate |
| Demo Friday | Bi-weekly (Fri 15:00) | All engineers + product | Cross-team showcase; informal feedback |
| Design-partner demo | Per phase milestone | Stream lead + product + design partner | Validate in front of customer |
| Post-incident review | Per incident | Incident commander + affected stream leads | Root-cause; action items; runbook update |
| Capacity review | Monthly | Platform team + stream leads | Provisioning, cost, SLO budget |

---

## 5. Cross-stream dependency patterns

### 5.1 The four patterns

Stream pairs interact in one of four patterns. Pick the right one early.

**Pattern 1 — Consumer-Producer.** Stream A produces an event; Stream B consumes it. Example: Stream A emits `theme.applied`; Stream F's analytics service consumes it for "themes applied per workspace per day" dashboards. **Async, eventually consistent.** No direct coupling.

**Pattern 2 — Contract-Reference.** Stream A defines a contract; Stream B references the contract in its own contracts. Example: Stream B's chart prop schema references `theme_service.TokenRef`. **Static coupling at build time.** Changes to the referenced contract follow §3.1.

**Pattern 3 — Service-Call.** Stream B's service calls Stream A's service over gRPC. Example: Stream E's presenter calls Stream A's component registry to look up smart-component props for the recap. **Synchronous, runtime coupling.** Calls go through the seam; never reach into the producer's database.

**Pattern 4 — Shared-Worktree.** Two streams jointly build a feature that crosses capabilities. Example: Stream B (live data) + Stream F (analytics) jointly build "engagement analytics for live polls." **Joint ownership.** A single tech lead is assigned; both stream leads review; single PR; ADR required.

### 5.2 Choosing the pattern

| Scenario | Pattern |
|---|---|
| Stream B wants to react when Stream A's state changes | 1 (Consumer-Producer) |
| Stream B wants to call Stream A synchronously | 3 (Service-Call) |
| Stream B wants Stream A's types in its own contract | 2 (Contract-Reference) |
| Stream B and Stream A jointly own a feature | 4 (Shared-Worktree) |

Pattern 4 is the heaviest; reserve it for cases where 1–3 genuinely cannot work. Most cross-stream work falls into Pattern 1 or 2.

---

## 6. Decision matrix for "who owns this?"

When a feature or contract has two streams asking for it, use this matrix:

| Question | If yes | If no |
|---|---|---|
| Is the artifact rendered or stored in a capability we own? | We own it | Next question |
| Does the artifact's primary API consumer belong to our stream? | We own it | Next question |
| Does the artifact exist already in another stream's seam? | That stream owns it; we consume | Next question |
| Is it cross-cutting (security, audit, tenancy)? | Cross-cutting owns it | **Architecture Council decides** |

If the matrix returns "Architecture Council decides," open an ADR with the two competing proposals. The Council picks within 1 week.

---

## 7. Codebase boundaries

### 7.1 Monorepo layout

```text
/apps/
  editor/                  # Stream A + canvas contributors
  api/                     # Platform team + capability modules
  viewer/                  # Stream E
  presenter/               # Stream E
  theme-marketplace-demo/  # Stream A
/services/
  registry/                # Stream A (components)
  theme/                   # Stream A (theming)
  brand/                   # Stream A (brand kits)
  data/                    # Stream B (live data)
  animation/               # Stream B (animation)
  prototype/               # Stream C (prototype)
  media/                   # Stream C (3D & media)
  ai/                      # Stream D (AI copilot)
  agent/                   # Stream D (MCP, deck-as-code)
  publish/                 # Stream E (sharing, export)
  audience/                # Stream E
  analytics/               # Stream F
  collab/                  # Stream F (comments, workflow)
  audit/                   # Cross-cutting (P20)
/workers/
  connectors/              # Stream B
  render/                  # Stream C + E
  brand-extract/           # Stream A
  theme-pair/              # Stream A
  ai-eval/                 # Stream D
  export/                  # Stream E
  analytics-rollup/        # Stream F
/realtime-gateway/         # Stream E + C
/packages/
  schema/                  # Foundation
  ui/                      # Stream A support
  canvas/                  # Foundation
  crdt/                    # Foundation
  tokens/                  # Stream A
  components-core/         # Stream A
  chart/                   # Stream B
  media-runtime/           # Stream C
  prototype-runtime/       # Stream C
  ai-sdk/                  # Stream D
  agent-sdk/               # Stream D
  analytics-sdk/           # Stream F
  mcp/                     # Stream D
/contracts/
  proto/                   # All (owned per seam)
  openapi/                 # All (owned per seam)
  schema/                  # All (owned per seam)
/infrastructure/
  terraform/               # Platform team
  helm/                    # Platform team
  ci/                      # Platform team
/docs/
  01-12-*.md               # Super docs
  <domain>.md              # Feature-domain docs
  development_phases/      # Phase plans + this doc
```

### 7.2 CODEOWNERS

```text
/apps/editor/              @canvas-team @design-system-team
/packages/canvas/          @canvas-team @graphics-team
/packages/schema/          @platform-team @ai-agents-team
/services/registry/        @ecosystem-team
/services/theme/           @ecosystem-team
/services/brand/           @ecosystem-team
/services/data/            @data-viz-team
/services/animation/       @data-viz-team
/services/prototype/       @prototype-team
/services/media/           @media-team
/services/ai/              @ai-agents-team
/services/agent/           @ai-agents-team
/services/publish/         @presenter-audience-team @publishing-team
/services/audience/        @presenter-audience-team
/services/analytics/       @publishing-team @data-viz-team
/services/collab/          @collab-team
/services/audit/           @enterprise-team @security-team
/workers/connectors/       @data-viz-team @security-team
/workers/render/           @media-team @publishing-team
/workers/brand-extract/    @ecosystem-team @security-team
/workers/ai-eval/          @ai-agents-team @security-team
/realtime-gateway/         @presenter-audience-team @media-team
/infrastructure/           @platform-team @sre-team
/contracts/proto/          @platform-team
/contracts/openapi/        @platform-team
/contracts/schema/         @platform-team
/docs/feature-domains/     @domain-owners
/docs/super-docs/          @product-director @principal-architect
/docs/development_phases/  @product-director @principal-architect
```

---

## 8. Conflict resolution

When two streams disagree on a contract, an ownership boundary, or a UX behavior:

1. **Tech leads talk first.** Most conflicts resolve in 30 minutes.
2. **If unresolved: stream lead escalation.** Each side writes a 1-paragraph position; the stream leads pick.
3. **If still unresolved: ADR.** Architecture Council arbitrates within 1 week.
4. **If still unresolved: product director.** The product director has final say on scope and UX; the principal architect has final say on architecture.

Every escalation produces a written decision (in chat, then transcribed to an ADR if durable).

---

## 9. Hand-off rules

When a phase ends and downstream phases start:

1. **Demo hand-off.** The finishing stream demos the phase to the downstream stream lead and the product director.
2. **Contract hand-off.** The finishing stream produces a "Hand-off Package": updated contracts, migration notes, open issues, known limitations, runbook.
3. **On-call hand-off.** The finishing stream's on-call rotation shadows the downstream stream's on-call for 1 week before the rotation transfers.
4. **Backlog transfer.** Open issues tagged with the downstream stream are reassigned to the downstream stream's Jira board.
5. **Telemetry ownership transfer.** Dashboards and alerts that were owned by the finishing stream are reassigned to the downstream stream or to the consuming service.
6. **Feature flag expiry.** Flags introduced by the finishing stream default to `on` for the consuming stream after 30 days; the consuming stream takes ownership.

---

## 10. Anti-patterns

| Anti-pattern | Why it's bad | What to do instead |
|---|---|---|
| Two streams jointly edit the same `*.proto` file | Merge conflicts; ownership confusion | One stream owns the seam; consumers propose additions via PR |
| Stream B reaches into Stream A's database directly | Coupling; brittle; bypasses seam | Use the seam (gRPC, REST, event) |
| Stream B forks a shared component to add a feature | Drift; upstream can't patch you | Add the feature to the shared component via PR |
| Stream A ships a feature without consulting Stream B's contract | Breaking change downstream | 24-hour review window in `#domio-contracts` |
| Stream E demos without Stream F's analytics | Stakeholders can't measure success | F co-presents analytics for every E demo |
| Stream C uses a vendor SDK not approved by Stream D's AI eval | Compliance gap | Vendor SDKs go through the same review as model APIs |
| Stream D ships an MCP tool without Stream P20's audit hook | Agents operate outside the audit trail | P20 reviews every agent surface |
| Stream A ships a marketplace listing without Stream P19's payout flow | Revenue flows without governance | Marketplace listings gate on payout wiring |
| Streams fight in PR comments | Slow; demoralizing | Escalate to stream leads per §8 |

---

## 11. Onboarding

A new engineer joining a parallel stream should:

1. Read the stream's phase docs (`phase-06..22`) end-to-end.
2. Read the stream's feature-domain doc (`components-templates.md`, `theming-branding.md`, etc.).
3. Read this doc.
4. Read the seam contracts the stream consumes (`theme.proto`, `component_registry.proto`, etc.).
5. Pair with a stream engineer for 1 week.
6. Shadow on-call for 1 week.
7. Attend the weekly stream demo + Architecture Council for 2 weeks before being expected to contribute.

---

## 12. Status and review

This doc is reviewed:

- **Quarterly** by the Architecture Council.
- **After every phase milestone** (Demo 1, Demo 2, Demo 3, GA).
- **After every Sev1 incident** where a cross-stream gap was a contributing factor.

Changes follow the same ADR process as architectural decisions.

_End of parallelization.md._