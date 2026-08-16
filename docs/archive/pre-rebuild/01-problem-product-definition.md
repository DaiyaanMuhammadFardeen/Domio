# 01 — Problem & Product Definition

> **Status:** Authoritative for product thesis, personas, competitive framing, and success metrics. Source of truth for _what_ and _why_; downstream docs (02-12) own the _how_. If a downstream doc contradicts 01, 01 wins unless the downstream doc cites 01 explicitly and supersedes it via an ADR.
> **Assumptions:**
>
> - Ten primary personas (P1-P10) and the named secondary audiences (BD market, regulated industries, OSS contributors) are stable for v1.
> - The nine-axis differentiation table reflects 2026 market state; refresh quarterly.
> - Success metrics are aspirational; they become real once baseline measurements exist post-launch.
>   **Owner:** Product director (with founder review).
>   **Last reviewed:** 2026-07-29.

---

> **Codename:** Domio
> **Tagline (working):** _The infinitely extensible presentation platform — Figma-grade canvas, Canva-scale ecosystem, live data, real-time presentation._ > **Scope stance:** Full platform. No MVP cut. Staged delivery is a _sequencing_ concern, never a _scope cut_. Every feature in `feature-list.md` (1–219, 221–240, plus extension ideas) is in scope for the product definition; features roll out in waves defined in `10-project-team-planning.md`.
> **Audience for this document:** founders, exec leadership, finance, partnerships, and any reviewer who has not yet read the engineering plan. If a decision below contradicts a later doc, the later doc wins _only_ after it cites this one.

---

## 1.0 Competitive Landscape

This is a saturated category if you define it narrowly. It is an empty category if you define it honestly: **no product today combines a Figma-grade canvas with Canva-scale template ecosystems, live data-bound charts that re-render on stage, deck-as-website publishing, real-time presenter + audience infrastructure, AI copilot, agentic/MCP interfaces, and enterprise governance in one platform.** Each competitor below is excellent at one or two of these axes and structurally weak at the rest.

| Vendor                                    | Canvas power                 | Template/library scale              | Live data on stage                                                 | Deck-as-website                            | Real-time presenting                                            | AI generation                                                    | Enterprise governance                       | Agentic / MCP                                           | Localization (Bangla)                                       |
| ----------------------------------------- | ---------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| **Microsoft PowerPoint**                  | Low (clip-art era model)     | Medium (Microsoft Create)           | OLE links only; no live web                                        | None; export to PDF/video                  | Presenter view only; no audience join                           | Designer suggestions only                                        | Strong (M365 governance)                    | None (VBA macros, COM)                                  | Bangla UI strings exist; data-bound charts weak             |
| **Apple Keynote**                         | Medium (Magic Move)          | Small (Apple-curated)               | None                                                               | None                                       | Apple-only continuity                                           | None                                                             | iCloud-family only                          | None                                                    | Limited                                                     |
| **Google Slides**                         | Low–Medium                   | Medium (templates gallery)          | Linked Sheets, but static snapshots in presentation                | "Publish to web" is a stale embed          | Limited Q&A in Meet; not native                                 | Gemini "Help me design" early                                    | Workspace DLP + audit                       | Apps Script, not first-class                            | Bangla UI exists; chart binding shallow                     |
| **Prezi**                                 | High (zooming canvas)        | Medium                              | None                                                               | Public link only                           | Limited                                                         | None                                                             | Weak                                        | None                                                    | Limited                                                     |
| **Beautiful.ai**                          | Medium (opinionated layouts) | Medium (curated)                    | Some chart live update                                             | Web link; not customizable                 | None                                                            | "Smart slides" rule-based                                        | SSO only                                    | None                                                    | Weak                                                        |
| **Gamma**                                 | Medium (web-first blocks)    | Medium (community)                  | Limited embed of live blocks                                       | Yes, web-first design                      | None                                                            | Strong prompt-to-deck                                            | Basic                                       | None                                                    | Weak                                                        |
| **Pitch**                                 | Medium–High                  | Medium                              | Chart live refresh in editor; not on stage                         | Web link, brand-controlled                 | Lightweight video room                                          | Light AI assist                                                  | Strong (workspace roles)                    | Public API only                                         | Weak                                                        |
| **Tome**                                  | Medium (cards)               | Small                               | Lightweight embeds                                                 | Yes, scrollytelling                        | None                                                            | Strong narrative AI                                              | None                                        | None                                                    | Weak                                                        |
| **Miro**                                  | Very High (canvas)           | Medium (templates)                  | None (whiteboard only)                                             | Board link; not a deck                     | Realtime collab yes; presenter mode weak                        | AI cluster/sort only                                             | SSO + audit                                 | Apps framework, not MCP-grade                           | Weak                                                        |
| **Figma**                                 | Highest in class             | Massive (community + FigJam)        | No native charts; only embeds                                      | No deck model                              | No presenter mode                                               | None for decks                                                   | Strong enterprise                           | Plugin runtime, but not deck-aware                      | Bangla UI; no deck semantics                                |
| **Canva**                                 | Medium (Magic Studio)        | Largest in market                   | Charts in editor; not live on stage                                | "Present" URL; not full website            | Limited live presentation                                       | Magic Design strong                                              | Brand kit + roles                           | Apps SDK, not deck engine                               | Bangla UI; live data limited                                |
| **Looker / Tableau / Power BI / Grafana** | N/A (analytics UIs)          | N/A                                 | Yes (native)                                                       | Dashboard embed only                       | None for presenting decks                                       | NLQ                                                              | Strong                                      | APIs/MCP emerging                                       | Strong                                                      |
| **Domio (this product)**                  | Figma-grade infinite canvas  | Canva-scale ecosystem + marketplace | First-class live data on stage, scenario switcher, what-if sliders | Deck-as-website, SEO-ready, custom domains | Phone-as-remote, audience join, presenter failover, parking lot | Full copilot: generate, redesign, rehearse, summarize, freshness | SSO/SCIM, DLP, audit, residency, governance | First-class MCP server, deck-as-code, agent audit trail | Bangla-first; BDT/payments; intermittent-connectivity-first |

### What Domio is genuinely differentiated on

1. **Live-data charts that re-render during the presentation**, with scenario switching, what-if sliders, and audience filter drill-down. PowerPoint, Keynote, and Slides do not do this; BI tools do data but not presentation; Canva/Pitch do not re-render under presenter control mid-talk.
2. **Deck-as-website with deck-as-code parity.** Every published deck has a URL, is SEO-indexable, can be embedded live in Notion/docs, and has a structured YAML/JSON source-of-truth that agents and humans both edit. No competitor treats the deck as both a visual artifact and a structured program.
3. **Real-time presenter + audience infrastructure as a first-class subsystem.** QR-join audience, live polls/Q&A/quizzes/word clouds, two-way slides, parking lot, presenter failover from phone, sub-second synced audience views across continents.
4. **First-class MCP server and agentic surface.** Not an API bolt-on; the deck engine _is_ the MCP server. Granular tools, agent-scoped permissions, dry-run mode, agent audit trail distinct from human edits, tool-call transcript.
5. **Local-first / offline-first posture** with a self-hostable engine (per feature #232). Critical for Bangladesh and any privacy-conscious enterprise.
6. **Enterprise governance that does not punish design power** — brand-locked regions, auto-updating shared slides, content expiry, deck inheritance trees, content DLP — these exist in pieces elsewhere, not together.

### What Domio is **not** trying to be

- Not a CRM, marketing automation suite, or pure BI tool. We embed data; we do not own the warehouse.
- Not a video editor. We have screen-recording (#80), narrated auto-play (#162), and MP4 export (#163), but not multi-track timeline editing.
- Not a doc-tool like Notion or Confluence. We can be embedded _into_ them, not replace them.

---

## 1.1 Problem Statement

**Decks are the most-used business communication artifact in the world, and the worst-served by software.** A modern team produces dozens of presentations a month — for board meetings, sales pitches, training, internal updates, classroom teaching, conferences, partner pitches — and the software they use is stuck in 2003 (PowerPoint/Keynote) or has traded design power for ecosystem reach without solving live data (Canva/Beautiful.ai/Gamma/Pitch). The result is that every quarter an analyst re-types numbers from a warehouse into a chart, the wrong pricing slide ends up in the wrong client deck, a "final_v7.pptx" email thread spawns, an audience sits through 40 slides they will never read, and a meeting ends with no capture of what was actually shown, what questions were asked, or which slide the CFO clicked into three times.

**Domio exists to make the deck a living, data-bound, collaborative, agent-extensible artifact** — one in which the numbers are always current, the design system is always on-brand, the audience is always participating, and an AI agent can author or audit a deck the same way it authors or audits code. Every feature in `feature-list.md` flows from this problem statement; if a feature cannot be tied to "the deck is stale, off-brand, unengaging, or non-programmable," it does not ship.

---

## 1.2 Target Users / Personas

The product must serve nine distinct primary personas. Each gets its own UI surface and its own success metric; none is "primary" in a way that lets us neglect the others.

| #   | Persona                                                          | Skill                         | Device                                      | Primary surface                                            | Primary jobs-to-be-done                                               | Friction today                                                                | Domio's answer                                                                                             |
| --- | ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P1  | **Designer** (in-house or agency)                                | High design literacy          | Desktop (Chromium/Safari) + drawing tablet  | Editor canvas, design tokens, component library            | Build a brand-perfect deck fast, hand it off to non-designers safely  | Templates break under their own weight; brand consistency is manual           | Components with smart props, brand-locked regions, token system, design linting                            |
| P2  | **Executive / presenter**                                        | Low design skill, high stakes | Laptop + phone                              | Presenter view, phone remote, rehearsal                    | Stand in front of a board and not embarrass themselves                | Rehearsal is solo; phone-as-remote is fragile; failover doesn't work          | Phone-as-remote + confidence monitor, AI rehearsal coach, presenter failover, presenter view on any screen |
| P3  | **Presenter (broad)** — sales, trainer, teacher, keynote speaker | Variable                      | Laptop + phone, often on stage              | Presenter + audience + embed-in-Zoom/Meet                  | Engage the room, answer questions, track time                         | Audience tools require a separate app; meeting tools don't integrate          | Native audience join via QR, polls/Q&A/quizzes, deep meeting-tool integration                              |
| P4  | **Analyst / data person**                                        | High data skill               | Desktop                                     | Editor + data binding panel + scenario UI                  | Put live numbers into a deck without re-typing                        | Every quarter is a re-paste from a warehouse; scenarios are duplicated slides | Live data sources, scenario switcher, what-if sliders, formula engine, provenance chips                    |
| P5  | **Educator / trainer**                                           | Medium                        | Laptop, classroom projector, student phones | Editor + presenter + audience (quiz/poll)                  | Run a class with engagement capture and per-student handout           | Engagement tools are a separate paid product; no LMS-grade analytics          | Built-in quizzes/leaderboards, attendance + engagement capture, per-student personalized handouts          |
| P6  | **Marketer / content operator**                                  | Medium                        | Desktop                                     | Editor + share/publish + analytics                         | Send the right deck to the right audience and know what happened      | No funnel view; no per-deck A/B; no CRM write-back                            | Per-link content control, analytics + CRM sync, A/B testing, funnel view                                   |
| P7  | **Reviewer / approver** (legal, brand, exec)                     | Variable                      | Desktop, mobile                             | Comment + suggestion mode + approval workflow              | Sign off on a deck without breaking it                                | Comments are in email; version history is filename-based                      | Comments pinned to elements, suggestion mode, approval workflow, legal hold                                |
| P8  | **Admin / workspace owner**                                      | Medium                        | Desktop                                     | Admin console + governance dashboards                      | Keep the org on-brand, licensed, audit-ready                          | Governance lives in a separate tool if at all                                 | Brand governance dashboard, DLP, audit, retention, residency controls                                      |
| P9  | **Creator / marketplace seller**                                 | Variable                      | Desktop                                     | Component/theme/template editor + marketplace portal       | Sell premium components and earn revenue                              | No marketplace anywhere in this category                                      | Community marketplace, revenue share, previewable live demos, theme marketplace                            |
| P10 | **Developer / agent builder**                                    | High technical                | Desktop + CLI                               | MCP server, public API, CLI, plugin SDK, deck-as-code YAML | Drive the deck engine programmatically; build agents and integrations | Most "AI in slides" is a black box with no real interface                     | First-class MCP server, granular tools, deck-as-code, CLI, agent-scoped permissions, agent audit trail     |

### Secondary audiences

- **Bangladesh market:** small business owner (phone-first, intermittent connectivity, Bangla UI, bKash/Nagad payment), enterprise IT in BD (BTRC/Bangladesh Bank overlays, data residency, BDT billing).
- **Privacy-conscious / regulated industries:** self-hosters, defense/healthcare/financial, who need the local-first / self-hostable engine.
- **Open-source contributors** (the marketplace creates a contributor flywheel we should explicitly design for).

### Persona → feature mapping

The persona→feature matrix is large; it lives in `02-requirements-engineering.md` §2.1.5 as a cross-cutting table. Each persona has at least one and usually many features whose absence would block their adoption — we use this matrix to drive release gates.

---

## 1.3 Jobs-to-be-Done (JTBD)

A JTBD frame keeps the feature list honest. Each JTBD is a sentence in the customer's voice. The full feature list maps to one or more JTBD; if a feature maps to none, it is suspicious.

**Functional jobs (the literal task):**

1. When I have to present to a board, _help me build a deck where the numbers cannot be stale_.
2. When I'm presenting, _help me adapt the deck in real time to the room_ (skip slides, reorder, change scenarios, drill into data).
3. When my team produces decks, _help us keep them on-brand without slowing us down_.
4. When I share a deck, _help me know who saw what, where they paused, and what they clicked_.
5. When I'm presenting, _help me engage the audience without asking them to install anything_.
6. When I have a 90-minute design problem, _help me describe it in words and get a strong starting point_.
7. When I need to run the same deck for different audiences, _help me maintain one source of truth and multiple audience-tailored views_.
8. When a piece of data in a deck is wrong, _help me fix it once and propagate everywhere_.
9. When my legal team needs to sign off, _help them do it without leaving the deck_.
10. When an AI agent needs to touch my deck, _help me audit exactly what it did_.

**Emotional jobs:** 11. _Help me not be embarrassed on stage._ 12. _Help me trust that the numbers I'm showing are correct._ 13. _Help me feel like my brand is professionally represented even when I'm not a designer._

**Social jobs:** 14. _Help my team look like a single, coherent org to the outside world._ 15. _Help me ship a deck that ranks on Google / gets shared publicly as a brand asset._

---

## 1.4 Success Metrics

We define **North Star metrics**, **acquisition metrics**, **engagement metrics**, **quality/NFR metrics**, and **business metrics**, each with a target and a measurement source. Targets below are **platform-level goals** for the full product; release-specific gates live in `10-project-team-planning.md`.

### 1.4.1 North Star

| Metric                         | Definition                                                                    | Target (post-launch +24 months) | Source                    |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------- | ------------------------- |
| Weekly Active Decks (WAD)      | Distinct decks with at least one edit, view, or share event in a 7-day window | 1M                              | event pipeline            |
| Weekly Active Presenters (WAP) | Distinct users with a presenter-mode session ≥ 60s in a 7-day window          | 250k                            | presenter session service |
| Deck-as-website monthly reach  | Sum of unique viewers across all public/published decks                       | 100M                            | share/view pipeline       |

### 1.4.2 Acquisition

| Metric                                              | Target                  | Source              |
| --------------------------------------------------- | ----------------------- | ------------------- |
| Self-serve signups / month                          | 50k by M12, 200k by M24 | auth service        |
| Activation rate (signup → first deck created in 7d) | ≥ 60%                   | product analytics   |
| Marketplace creator signups / month                 | 1k by M18               | marketplace service |

### 1.4.3 Engagement (per active user per week)

| Metric                                                             | Target           | Source               |
| ------------------------------------------------------------------ | ---------------- | -------------------- |
| Median decks edited per WAU                                        | ≥ 3              | editor events        |
| Median presenter-mode minutes per WAP                              | ≥ 30             | presenter service    |
| Median audience join rate when presenter mode active               | ≥ 35% of invited | audience service     |
| % of decks with at least one live data binding                     | ≥ 40% by M18     | data binding service |
| % of decks with at least one AI assist action (gen/redesign/coach) | ≥ 50% by M12     | AI service           |

### 1.4.4 Quality / NFR (rolling 30-day)

| Metric                                            | Target                   | Source              |
| ------------------------------------------------- | ------------------------ | ------------------- |
| p50 editor keystroke-to-pixel latency             | ≤ 50 ms                  | client RUM          |
| p95 editor keystroke-to-pixel latency             | ≤ 150 ms                 | client RUM          |
| p95 CRDT sync round-trip (multiplayer cursor)     | ≤ 120 ms                 | realtime RUM        |
| Presenter-mode cold-start to first slide rendered | ≤ 2 s on mid-tier laptop | client RUM          |
| 10k concurrent audience join success rate         | ≥ 99%                    | audience load tests |
| Availability (control plane)                      | 99.95% monthly           | uptime monitor      |
| Availability (realtime presence)                  | 99.9% monthly            | uptime monitor      |
| WCAG 2.2 AA conformance                           | 100% of P1 surfaces      | axe + manual audit  |
| Incident MTTR (Sev1)                              | ≤ 30 min                 | incident system     |

### 1.4.5 Business

| Metric                             | Target                           | Source      |
| ---------------------------------- | -------------------------------- | ----------- |
| Paid conversion (free → paid seat) | ≥ 5% of activated orgs by M12    | billing     |
| Net revenue retention              | ≥ 120%                           | billing     |
| Marketplace GMV / month            | $500k by M18                     | marketplace |
| Self-host deployments              | ≥ 25 enterprise customers by M24 | sales       |

---

## 1.5 Scope: In, Deferred, Non-Goals

### 1.5.1 In scope (the entire `feature-list.md` plus extension ideas)

All 16 feature domains, including:

- **Editor & canvas** (#1–22) — see `docs/editor-canvas.md`
- **Components & templates** (#23–36) — see `docs/components-templates.md`
- **Theming & branding** (#37–47) — see `docs/theming-branding.md`
- **Live data & charts** (#48–64) — see `docs/live-data-charts.md`
- **3D, motion, rich media** (#65–84) — see `docs/3d-motion-media.md`
- **Animation & transitions** (#85–95) — see `docs/animation-transitions.md`
- **Prototyping & interactivity** (#96–107) — see `docs/prototyping-interactivity.md`
- **AI copilot** (#108–125) — see `docs/ai-copilot.md`
- **Presenter experience** (#126–141) — see `docs/presenter-experience.md`
- **Audience participation** (#142–154) — see `docs/audience-participation.md`
- **Sharing & publishing** (#155–168) — see `docs/sharing-publishing.md`
- **Analytics** (#169–178) — see `docs/analytics.md`
- **Collaboration & workflow** (#179–192) — see `docs/collaboration-workflow.md` (linked from extension list — note: the doc must exist; if not present at write time, see §1.5.4)
- **Enterprise & governance** (#193–204) — see `docs/enterprise-governance.md`
- **Novel & frontier** (#205–219) — see `docs/novel-frontier.md`
- **Agentic & programmable interfaces** (#221–240) — see `docs/agentic-interfaces.md`

**Extension ideas from `feature-list.md`:** "Weaving AI further into what already exists" + "A few genuinely new ideas beyond agentic access" — all folded into the 16 domains above; tracked in `02-requirements-engineering.md` §2.1.6.

### 1.5.2 Explicit non-goals (out of product scope)

These are _intentional_ non-goals. They are not "later" — they are "no."

1. **Not a CRM, marketing automation platform, or sales engagement tool.** We sync _to_ CRMs; we do not host contacts, accounts, or campaigns.
2. **Not a full data warehouse / BI authoring tool.** We _consume_ data sources and embed BI dashboards; we do not author dashboards or own the warehouse.
3. **Not a video editor.** Screen recording, narrated auto-play, and MP4 export are in scope; multi-track timeline editing, color grading, and effects compositor are out of scope.
4. **Not a document collaboration tool** (Notion/Confluence/Google Docs competitor). We embed _into_ them; we do not host long-form documents.
5. **Not a code IDE.** Code blocks in decks run in a sandboxed iframe (#82) but we do not provide a full IDE experience.
6. **Not a domain-specific vertical SaaS** (e.g., a pitch deck CRM, a sales training platform). Our marketplace can host vertical add-ons; the platform does not become one.
7. **Not an LMS.** Audience participation includes engagement capture for training, but full LMS features (SCORM/xAPI, course catalogs, certification) are not in scope — partners can integrate.
8. **Not a phone OS, native desktop OS, or email client.**
9. **Not an end-to-end encrypted (E2EE) collaboration platform** in v1. CRDT sync is encrypted in transit and at rest; we do not provide zero-knowledge guarantees that would prevent server-side AI features. A future "E2EE workspace" tier may emerge; it is not in this release.

### 1.5.3 Deferred within scope (sequenced, not removed)

Sequenced delivery — not scope reduction — for the full platform is documented in `10-project-team-planning.md`. Examples of items intentionally late in the sequence (but still in scope):

- Cross-deck knowledge graph at scale (#219, §239–240) — late because it requires rich metadata accumulation.
- AI meeting listener (#214) — late because of privacy review and opt-in UX complexity.
- Haptic remote feedback (#217) — late because of hardware dependency uncertainty.

### 1.5.4 Doc-inventory cross-references

This planning package assumes the following docs _under_ `docs/` (treated as already present; the super docs reference them):

- `editor-canvas.md` ✓
- `components-templates.md` ✓
- `theming-branding.md` ✓
- `live-data-charts.md` ✓
- `3d-motion-media.md` ✓
- `animation-transitions.md` ✓
- `prototyping-interactivity.md` ✓
- `ai-copilot.md` ✓
- `presenter-experience.md` ✓
- `audience-participation.md` ✓
- `sharing-publishing.md` ✓
- `analytics.md` ✓
- `collaboration-workflow.md` — **referenced as if present**; the super docs link to it. (If it does not yet exist in `docs/`, it is a precondition for final review; see "Open decisions" at the end.)
- `enterprise-governance.md` ✓
- `novel-frontier.md` ✓
- `agentic-interfaces.md` ✓

---

## 1.6 Constraints and Assumptions

### 1.6.1 Constraints

| #   | Constraint                                                                                                                               | Implication                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Must run in modern browsers (Chromium, Firefox, Safari) on desktop and mobile Safari/Chrome on Android. IE/Edge Legacy out of scope.     | Canvas engine must use WebGL2 + WebGPU where available, fall back to Canvas2D.                                                       |
| C2  | Offline editing required (#21). CRDT sync on reconnect.                                                                                  | Service worker, IndexedDB-backed local store, CRDT library chosen in `06-technology-stack.md`.                                       |
| C3  | WCAG 2.2 AA conformance on all P1 surfaces.                                                                                              | Accessibility is non-negotiable; verification strategy in `03-ux-interface-planning.md`.                                             |
| C4  | i18n with Bangla as a tier-1 locale.                                                                                                     | Unicode, Bangla numerals, RTL-aware typography (RTL reserved for future Arabic/Hebrew; not active in v1 but data model supports it). |
| C5  | Multi-tenant SaaS by default; self-host option (#232) required for regulated/policy-driven customers.                                    | Two deployment shapes from one codebase; see `08-infrastructure-devops.md`.                                                          |
| C6  | Bangladesh PDPA 2026 + Cyber Security Ordinance 2025 + sectoral overlays (Bangladesh Bank / BTRC).                                       | Consent, DSR, breach response, residency, audit. See `11-legal-compliance-bangladesh.md`.                                            |
| C7  | Currency in BDT and USD; pricing denominated in USD for global, BDT-equivalent shown for BD.                                             | Currency stored as integer minor units; display localized.                                                                           |
| C8  | 99.95% control-plane availability, 99.9% realtime.                                                                                       | Architecture must be HA from day one; see `08`.                                                                                      |
| C9  | Support 10k concurrent audience per live session, scaled horizontally.                                                                   | Realtime tier must be elastically scalable.                                                                                          |
| C10 | Marketplace creators must be paid via approved Bangladesh Bank-licensed aggregator for BD-based creators, and Stripe Connect for non-BD. | Marketplace payout pipeline is BD-payment-aware.                                                                                     |

### 1.6.2 Assumptions

| #   | Assumption                                                                                                                      | Risk if wrong                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A1  | Target market is global English-first, with tier-2 locales: Bangla, Spanish, Portuguese, French, Arabic (RTL), Japanese, Hindi. | If we must add many RTL/Devanagari locales early, schedule shifts.                            |
| A2  | Self-host customers run Kubernetes or a single-node Docker compose.                                                             | If many need bare-metal, ops cost rises.                                                      |
| A3  | A "scene graph + CRDT" data model can represent every deck domain (3D, charts, prototyping, animation).                         | If some domain resists, fallback is feature cut (avoided by proof-of-concept in milestone 1). |
| A4  | AI model providers (OpenAI, Anthropic, open-weight) remain available with acceptable latency.                                   | If latency/availability degrades, we route to local open-weight models (see `06`).            |
| A5  | CRDT (Yjs) scales to the document sizes we expect (10k-element decks, 50+ concurrent editors) without unacceptable memory.      | Mitigation: sub-document CRDTs + scene graph sharding.                                        |
| A6  | Real-time audience scale achieved with managed realtime (e.g., LiveKit/Liveblocks/Ably) or self-hosted (NATS + custom).         | See `06-technology-stack.md` §6.4.                                                            |
| A7  | bKash/Nagad/Rocket APIs and aggregators (SSLCommerz, ShurjoPay) remain stable and Bangladesh Bank-approved.                     | Re-validate quarterly.                                                                        |
| A8  | PDPA 2026 enforcement is active May 2027; we treat this as a hard deadline.                                                     | If earlier, runway shorter.                                                                   |

---

## 1.7 Product Principles

These ten principles are the tie-breaker when two reasonable design choices conflict. Every PR review and every ADR can cite them.

1. **Live beats stale.** If a number can be live, it should be live. Snapshots are a fallback, not the default.
2. **The deck is a program, not a picture.** Every visual has a structured schema representation that an agent (or a smart human) can edit.
3. **One source of truth, many views.** The same deck renders as a slide deck, a scrollytelling page, a PDF, an MP4, a Notion embed, and an MCP tool response — without duplication.
4. **Brand discipline is a feature, not a restriction.** Admins get strong governance; designers get escape hatches that do not break brand for others.
5. **Audience is a participant, not a viewer.** Every published deck should be reachable as an interactive surface unless explicitly opt-out.
6. **AI is a collaborator, not an oracle.** Every AI output is editable, attributable, and undoable.
7. **Offline is a first-class state.** The app is not "broken" without internet; it is "local mode."
8. **Bangla is a tier-1 locale, not a translation afterthought.**
9. **The agent surface is a product surface.** MCP tools are versioned, discoverable, and treated with the same care as the GUI.
10. **Performance is a feature.** The canvas must hold 60 FPS, the editor must feel instant, and the presenter must not fight the software on stage.

---

## 1.8 Risks and Mitigations

| ID  | Risk                                                   | Probability | Impact | Mitigation                                                                                         |
| --- | ------------------------------------------------------ | ----------- | ------ | -------------------------------------------------------------------------------------------------- |
| R1  | CRDT memory blow-up for very large decks               | M           | H      | Sub-document sharding, scene-graph paging, periodic GC of tombstones                               |
| R2  | Live data source reliability on stage                  | M           | H      | Snapshot fallback, source health indicator (#63), pre-presentation warmup                          |
| R3  | AI model cost overruns                                 | M           | M      | Caching, prompt compression, model tiering per task                                                |
| R4  | PDPA enforcement begins earlier than expected          | L           | H      | Compliance runway (consent, DSR, retention) built in milestone 1; see `11`                         |
| R5  | Self-host customers run unsupported configurations     | M           | M      | Documented reference architectures; "Enterprise Self-Host" support tier                            |
| R6  | Marketplace quality collapse                           | M           | M      | Editorial curation, review process, takedown tooling, creator reputation                           |
| R7  | WebGPU adoption lags on Safari                         | M           | M      | WebGL2 fallback path; progressive enhancement                                                      |
| R8  | 10k audience scale doesn't hold under load             | L           | H      | Quarterly load tests, chaos drills, autoscaling validated before public GA                         |
| R9  | Brand governance over-applies and frustrates designers | M           | M      | Admin configurability, "soft" vs "hard" lock distinction                                           |
| R10 | AI hallucinations in generated decks                   | M           | H      | Citation requirement (#109), confidence surfacing (#238), approval gates for high-stakes templates |
| R11 | Bangladesh Bank/bKash API changes                      | L           | M      | Aggregator abstraction layer; quarterly contract review                                            |
| R12 | Browser sandbox escapes (plugin/code block)            | L           | H      | iframe sandbox + capability tokens + CSP; pen-test before each plugin SDK GA                       |
| R13 | Gaze-tracking / webcam features cause privacy concerns | M           | M      | Opt-in, on-device processing where feasible, clear disclosure, no upload of biometric data         |
| R14 | Currency conversion / BDT volatility for paid plans    | L           | L      | USD-denominated pricing with BDT display; hedging at finance layer                                 |
| R15 | Project team underestimates MCP surface maintenance    | M           | M      | Treat MCP as a product with its own versioning, deprecation, and owner                             |

---

## 1.9 Decisions Log (this document)

| ID      | Decision                                                                                 | Rationale                                                                                 | Alternative considered                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D-PD-01 | Treat full feature list as in-scope; use staged delivery, not MVP cuts.                  | User explicit instruction; long-term scalable architecture > short-term hack.             | "MVP cut" — rejected as misaligned with the brief.                                                                           |
| D-PD-02 | Modular monolith control plane + independent data-plane workers.                         | Faster to ship, easier to refactor, clear seam for later split.                           | Pure microservices — rejected as premature. Pure monolith — rejected for AI/renderer scale. See `04-system-architecture.md`. |
| D-PD-03 | First-class MCP server as a product surface, not an API afterthought.                    | Differentiator and strategic positioning.                                                 | Bolt-on REST API only — rejected. Both — accepted; MCP is the primary, REST secondary.                                       |
| D-PD-04 | Self-host capability is required (not optional).                                         | Enterprise sales, regulated industries, BD market, privacy-conscious users.               | SaaS-only — rejected as too narrow.                                                                                          |
| D-PD-05 | Bangla is tier-1, not tier-2.                                                            | BD is a stated market; mobile-first + intermittent-connectivity are explicit constraints. | English-only-then-localize — rejected.                                                                                       |
| D-PD-06 | Real-time audience infrastructure is first-party, not a third-party embed.               | Differentiator; integration depth required.                                               | Embed Zoom/Meet — accepted for _cross-posting_, but native audience join is first-party.                                     |
| D-PD-07 | Live data on stage is non-negotiable.                                                    | Core differentiator; defining feature.                                                    | "Static charts only" — rejected.                                                                                             |
| D-PD-08 | CRDT (Yjs) chosen over Automerge for default.                                            | Performance, ecosystem, awareness. See `06`.                                              | Automerge — kept as fallback option if Yjs hits memory limits.                                                               |
| D-PD-09 | Two-currency pricing model (USD + BDT display).                                          | Local purchasing power parity without operational complexity.                             | USD-only — rejected for BD conversion friction.                                                                              |
| D-PD-10 | Treat `collaboration-workflow.md` as a precondition doc — flag if absent at review time. | The super docs must reference it.                                                         | Write it inside this doc — rejected; must stay in its own domain doc.                                                        |

---

## 1.10 Acceptance Criteria (this document)

This doc is "done" when:

- [x] Competitive landscape covered with a comparison table and explicit differentiation.
- [x] Problem statement written in 2–3 sentences.
- [x] All ten personas enumerated with skill/device/surface/JTBD.
- [x] JTBD enumerated with emotional/social jobs included.
- [x] Success metrics cover North Star, acquisition, engagement, NFR, business.
- [x] Scope is explicit: in, deferred, non-goals.
- [x] Constraints and assumptions tables are complete.
- [x] Product principles are written and usable as tie-breakers.
- [x] Risks are scored and have mitigations.
- [x] All 16 feature-domain docs are linked by name.

---

_End of 01-problem-product-definition.md._
