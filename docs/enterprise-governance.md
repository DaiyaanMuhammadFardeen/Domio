# Section 14 — Enterprise, Governance & Platform (Features 193–204)

> **Scope:** This document is the deep technical plan for the enterprise-grade substrate of Domio: SSO/SCIM identity, brand governance, content DLP, immutable audit logs, data residency, retention/legal-hold, seat analytics, the public API surface, webhooks, plugin sandboxing, the custom-component SDK, and the headless rendering service. These are the features that move Domio from "great product for individuals and teams" to "platform IT, Legal, and Security will approve for an enterprise rollout." Every other section (1–13, 15, 16) emits events into this layer and is constrained by its policies; in turn, this section's contracts are the only surface that third-party agents and partner integrations touch directly. Treat the contracts here as load-bearing for the rest of the platform.

---

## 1. Feature-by-Feature Mapping

Each feature is annotated with: short **intent**, **acceptance criteria** (testable), **behavioral details / edge cases**, and **dependencies** (internal to this section and external to others).

### Feature 193 — SSO (SAML/OIDC), SCIM provisioning, and role hierarchies

- **Intent:** Allow IT to bind Domio to a corporate identity provider (IdP) so that authentication, user lifecycle, and group/role mapping flow from a single source of truth (Okta, Entra ID, Google Workspace, Ping, JumpCloud, OneLogin). Both SAML 2.0 and OIDC are first-class; SCIM 2.0 handles Just-In-Time provisioning, deprovisioning, and group → role projection.
- **Acceptance criteria**
  - Admin can configure SAML 2.0 via metadata URL or manual XML; IdP-initiated and SP-initiated both work.
  - Admin can configure OIDC via discovery URL, client ID/secret, and a chosen `scope` (default `openid email profile groups`).
  - SCIM 2.0 endpoint accepts `POST /Users`, `PATCH /Users/{id}`, `DELETE /Users/{id}`, `GET /Users` (filter + pagination), and `GET/PATCH/POST/DELETE /Groups`. Filter expressions (`userName eq "…"`, `displayName co "…"`) are honored.
  - JIT provisioning on first SSO login creates a user mapped by IdP-asserted email; SCIM pre-provisioning also works.
  - Group → role mapping: an admin-defined table (`idpGroup → domioRole`) maps incoming IdP groups to Domio roles (`viewer`, `commenter`, `editor`, `admin`, `owner`, custom).
  - Role hierarchies: roles inherit permissions from parent roles; `admin` ⊇ `editor` ⊇ `commenter` ⊇ `viewer`.
  - Deprovisioning via SCIM `DELETE` soft-disables the user (sessions revoked, seat released) and is idempotent.
- **Behavioral details / edge cases**
  - **SCIM deprovision race:** if a user opens a deck, then SCIM `DELETE` arrives, the active session is invalidated within 5 seconds; unsaved CRDT state (#21) is retained for 30 days as `recoverableByOwner`.
  - **Group-name mismatches:** if SCIM sends `displayName` ≠ `externalId`, we prefer `externalId` (stable) and expose `displayName` as a UI alias only.
  - **JIT vs SCIM conflict:** if a user is JIT-created and a SCIM `POST` arrives simultaneously, the SCIM record wins (authoritative) and the JIT creation is reconciled (no duplicate).
  - **Nested groups:** we flatten Okta-style nested groups into the direct group set before applying the mapping table; the UI shows the flattened set plus an "expanded from" hint.
  - **Domain capture:** an admin can claim an email domain (verified via DNS TXT) so any SSO login matching that domain auto-joins the tenant.
  - **IdP failure:** if the IdP is unreachable, SSO logins surface a clear "IdP unavailable" message; SCIM-driven deprovisioning still succeeds (queued locally, retried with backoff up to 24 h).
  - **SAML signature:** we enforce signed assertions; unsigned or `SignOnly` requests are rejected. OIDC enforces `PKCE` for public clients and a `state`/`nonce` check.
- **Dependencies:** #197 (residency; IdP connection metadata lives in a residency zone), #194 (brand governance admin must be in a role that can read SCIM), #198 (deprovision triggers retention evaluation), #200 (public API supports SCIM-style service principals as OAuth subjects).

### Feature 194 — Brand governance dashboard: org-wide on-brand score, violation reports

- **Intent:** Give admins a single dashboard showing how on-brand every deck in the tenant is, ranked by drift, with one-click drill-downs into specific violations and remediation actions.
- **Acceptance criteria**
  - Dashboard renders an org-wide **on-brand score** (0–100) computed from weighted violations against the active brand kit (#39, #37).
  - Per-deck drill-down lists violations grouped by category: off-palette colors, off-type fonts, off-template layouts, brand-locked region edits (#36), accessibility regressions (#44).
  - Trend line: score over the last 30 / 90 / 365 days.
  - Filters by team, folder, deck owner, brand kit, and violation severity (`error`, `warning`, `info`).
  - Exportable violation report (CSV + PDF) and a webhook (#201) fired when score drops below an admin-configured threshold.
  - Remediate action: clicking a violation jumps to the offending slide/element with a "fix-it" suggestion ("swap to brand color `#0A2540`").
- **Behavioral details / edge cases**
  - Scoring is **deterministic and explainable**: every score change has a diff of contributing violations.
  - **Stale brand kits:** if a brand kit is updated, the score for every deck rebases and the diff is visible to admins.
  - **Ignore-list overrides:** admins can mark a specific deck/folder as exempt from a rule (e.g., an M&A project that intentionally uses muted colors).
  - **Severity weighting** is per-tenant configurable; defaults: off-palette = 5, off-type = 5, brand-lock edit = 10, accessibility = 8.
  - **First-class ties to #46 (style linting):** the dashboard is the roll-up view of the same lint results that the editor surfaces inline.
  - **Sampling:** for tenants > 10 K decks, the score is incrementally computed nightly; the dashboard shows a "last computed" timestamp.
- **Dependencies:** #36 (brand-locked regions), #37 (design tokens), #39 (brand kit), #46 (style linting), #121 (AI layout repair — used as the "fix-it" suggestion), #200 (programmatic read via API).

### Feature 195 — Content DLP rules (block sharing decks containing flagged terms externally)

- **Intent:** Inspect deck content (text, alt-text, data-bound values, comments, version-history snapshots) against configurable DLP rules and **prevent** external sharing (#155–#159) or export (#163, #164) when a rule matches.
- **Acceptance criteria**
  - Admin can define DLP rules with: name, severity (`block`/`warn`/`log`), matchers (regex, keyword, dictionary, ML classifier), and scope (specific element types, specific data sources, all decks, selected folders).
  - Sharing a deck externally (#159) whose content matches a `block` rule returns a hard error and offers a "request exception" path that notifies the DLP admin.
  - Sharing internally shows a non-blocking `warn` banner; exporting (`PDF`/`MP4`/`PPTX`) requires admin override if any `block` rule matches.
  - Pre-built rule packs ship out of the box: PII (emails, SSN, IBAN, NID, passport, phone numbers), financial (credit cards with Luhn check), confidential keywords (configurable).
  - Rule evaluation runs on **the rendered content** (data-bound values resolved, comments included, alt-text included) — not just the schema.
- **Behavioral details / edge cases**
  - **Performance budget:** DLP scan ≤ 2 seconds for decks up to 200 slides and ≤ 50 MB text payload. See §8 for the scan budget.
  - **ML classifier hooks:** rules can call a pluggable classifier endpoint (Domio-hosted or customer-hosted); timeouts are surfaced as "needs review" not "block" to avoid false positives.
  - **Re-scan on edit:** when an editor saves a slide, only the deltas are re-scanned; full re-scan runs nightly and on demand.
  - **Hash-only mode:** customers can opt to send DLP content to the engine as a one-way hash so plaintext never leaves the editor process for highly sensitive tenants — exchange for higher false-negative risk on fuzzy matching.
  - **False positive handling:** end users can mark a finding "not PII" with a justification; the DLP admin reviews and either marks it a global allow or re-classifies.
  - **Comment redaction:** comments containing matched terms are redacted in audit-log (#196) entries with `████████` and the rule id, but the comment itself is preserved for the owner.
- **Dependencies:** #4 (data sources — DLP applies to resolved data), #11 (sharing — DLP gates share), #48 (data bindings), #159 (per-link control), #164 (export pipeline), #196 (DLP findings also appear in audit log).

### Feature 196 — Audit logs for every view, edit, share, and export

- **Intent:** Provide a tamper-evident, append-only ledger of every action that could affect security, privacy, or compliance posture — accessible to admins and (subject to policy) exportable for regulators.
- **Acceptance criteria**
  - Every event recorded: user id, tenant id, session id, IP, user agent, action type, target resource, before/after diff (when applicable), timestamp, residency zone, and a hash-chained sequence number.
  - Action types at minimum: `auth.login`, `auth.sso_failure`, `auth.scim_sync`, `user.created`, `user.disabled`, `role.changed`, `deck.viewed`, `deck.edited`, `deck.shared`, `deck.unshared`, `deck.exported`, `dlp.blocked`, `legalhold.placed`, `legalhold.released`, `retention.purged`, `webhook.delivered`, `plugin.installed`, `plugin.executed`, `api.called`.
  - Append-only: there is no `UPDATE` or `DELETE` endpoint on the audit log API; entries can be `redacted` (overwritten with `[REDACTED]`) by a `compliance-admin` role but the redaction itself is logged.
  - Hash chain: each entry includes `prevHash = sha256(entry[n-1].canonicalJSON + seq)`; verification re-runs the chain and reports any break.
  - Searchable in a dedicated query UI with filters by actor, target, action, time range, residency zone, and free-text on the `payload`.
  - Export formats: NDJSON (canonical), CSV, and a signed bundle (JSON + detached signature) for legal review.
- **Behavioral details / edge cases**
  - **Read-after-write:** every action emits the audit event within the same transaction commit (outbox pattern) so the log can never lag the action it logs.
  - **Retention:** audit logs have their own retention policy (default 7 years, configurable per tenant, min 1 year) and are **exempt** from deck retention purges (#198) — legal-defensibility wins over storage cost.
  - **Customer-side verification:** admins can run `domio audit verify --from … --to …` (CLI #231) to independently re-checksum a window; a verification report is signed by Domio and returned.
  - **High-cardinality search:** for tenants > 100 M events, the query service falls back to a columnar store (see §4) with p95 < 3 s for a 30-day window filtered by tenant.
  - **Privacy layering:** audit entries for actions on a deck whose owner has a privacy override do not store content, only structural metadata; DLP redaction (#195) is applied to any text field.
- **Dependencies:** #193 (SSO events), #195 (DLP events), #197 (residency zone is on every entry), #198 (legal hold and retention events), #199 (seat analytics rolls up audit events), #200 (programmatic query), #201 (audit events are also deliverable to a tenant webhook), #227 (agent edits produce distinct audit entries).

### Feature 197 — Data residency options and SOC 2 / GDPR compliance tooling

- **Intent:** Let admins pin tenant data to a specific residency zone (e.g., `eu-west`, `us-east`, `ap-south`, `bd-dhaka`) and surface the controls, evidence, and contractual commitments auditors expect (SOC 2 Type II report, GDPR DPA, PDPA Bangladesh).
- **Acceptance criteria**
  - Admin chooses a primary residency zone at tenant creation and a fallback zone for DR; the choice is immutable for 90 days post-creation to avoid data-sovereignty churn.
  - Every storage layer (object store, search index, audit log) is sharded by zone; cross-zone replication is opt-in and explicit.
  - Compliance posture page lists: SOC 2 Type II report (link, refresh cadence), GDPR DPA (link), sub-processor list, data-flow diagram, breach-notification SLA (72 h), and an "evidence locker" of controls.
  - Data subject request (DSR) tooling: `access` (export), `erasure`, `rectification`, `portability`, and `object` endpoints that produce audit-logged actions within 30 days (GDPR Art. 12).
  - Cross-border transfer guardrails: if a tenant's zone is `eu-west` and a US-only feature (e.g., a US-residency-only connector) is enabled, the UI shows a transfer notice and requires an admin-signed SCC.
  - Bangladesh PDPA: residency `bd-dhaka` keeps a synchronized real-time local copy of any data classified as "restricted" or CII per §11 of the planning guide.
- **Behavioral details / edge cases**
  - **Lock-in vs. portability:** residency choice creates bucket-level segregation so a future relocation can be done by re-pointing (not re-platforming) — see §7 of the planning guide.
  - **Authority-driven relocation:** the discretionary relocation power noted in §11.2 of the planning guide is operationalized as a `residency.relocate` admin endpoint that requires a 2-of-3 admin quorum and emits an auditable event with reason text.
  - **Regional features:** some features are unavailable in certain zones at product launch (e.g., `bd-dhaka` may lag `us-east` by one release); the dashboard shows a "feature availability by zone" matrix.
- **Dependencies:** #193 (IdP metadata is zone-local), #195 (DLP scanning service can be region-pinned), #196 (audit log is zone-pinned), #198 (retention enforcement is zone-aware), #200 (API gateway is zone-pinned; clients select a region), #204 (headless renderer is zone-pinned).

### Feature 198 — Legal hold and retention policies on decks

- **Intent:** Allow admins to place decks (or whole folders) under a legal hold that overrides normal deletion, and to enforce tenant-wide retention policies that automatically purge or anonymize decks past their lifetime.
- **Acceptance criteria**
  - Admin can place a legal hold on any deck, folder, or all content owned by a user; while held, the deck cannot be deleted, version history cannot be trimmed, and CRDT state is frozen.
  - Holds are scoped: start date, optional end date, custodian list, matter reference, and a reason (free text + matter-id).
  - Retention policies are configurable per content class: `drafts`, `published`, `archived`, `legalHold`, `auditLog` — with rules like "drafts: delete 90 days after last edit," "auditLog: retain 7 years."
  - Dry-run mode: a policy can be run in `preview` to produce a report of what *would* be purged before destructive execution.
  - DSR-driven erasures (#197) operate inside the legal-hold constraint — content under hold is anonymized rather than deleted, and the event is logged.
- **Behavioral details / edge cases**
  - **Hold precedence:** a legal hold always wins over retention; if a deck is under hold, the retention engine skips it and notes "skipped: under hold" in the run log.
  - **End-of-hold cascade:** when a hold ends, the deck is re-evaluated against retention; if it now falls outside policy, the cascade purges or anonymizes as configured.
  - **Quorum on hold release:** hold release requires a different admin than the one who placed it (separation of duties) and emits an `audit` event.
  - **Custodian changes:** if a hold custodian leaves the org, ownership reverts to a designated `legalHoldAdmin` group; release is still possible but logged with both actor ids.
- **Dependencies:** #193 (deprovisioned users still have holds intact until released), #196 (every hold event is audited), #197 (residency zone is preserved through purges), #200 (retention runs are triggerable via API).

### Feature 199 — Usage-based seat analytics for admins

- **Intent:** Show admins how seats are consumed across the tenant, broken down by role, team, and activity, with insights for right-sizing licensing and detecting dormant accounts.
- **Acceptance criteria**
  - Seat utilization: total assigned, total active (logged in within last 30 days), total inactive (no login in 90+ days), and total dormant (no login in 180+ days).
  - Activity heatmap per seat: sessions per day, edits per week, decks created vs. viewed, exports performed.
  - Cost center / department tagging on seats (importable via SCIM #193).
  - License optimization recommendations: "5 seats inactive for 90+ days, 3 eligible for downgrade from `editor` to `viewer`."
  - Exportable seat report (CSV) and an optional monthly email digest.
- **Behavioral details / edge cases**
  - **Seat types:** `viewer`, `commenter`, `editor`, `admin` consume licenses at different price points; the dashboard computes spend by role.
  - **Agent seats:** API keys (#200) and MCP server sessions (#221) consume a separate `service-account` pool, not human seats — visible distinctly on the dashboard.
  - **Privacy on per-user analytics:** admins see aggregate numbers; per-user detail requires `compliance-admin` role and is audit-logged.
  - **Anomaly flagging:** a sudden spike in exports from a single seat (potential exfiltration) triggers a `seat.alert` webhook (#201).
- **Dependencies:** #193 (seat identity from SCIM), #196 (raw events), #200 (API service-account consumption), #201 (alerts), #231 (CLI can pull seat reports).

### Feature 200 — Public API + SDK (programmatic deck generation)

- **Intent:** A first-class, versioned, authenticated REST + GraphQL surface that lets customers build Domio into their data pipelines — generating weekly business reviews, syncing dashboards, batch-rewriting decks after a brand refresh — with the same fidelity as the UI.
- **Acceptance criteria**
  - **REST endpoints** for full deck lifecycle: `POST /v1/decks`, `GET /v1/decks/{id}`, `PATCH /v1/decks/{id}` (RFC 7396 merge-patch), `DELETE /v1/decks/{id}`, `POST /v1/decks/{id}/versions`, `GET /v1/decks/{id}/versions`, etc.
  - **GraphQL** schema (`/graphql`) for granular read/write — agents (#221–#234) use this as the substrate for fine-grained edits.
  - **Typed SDKs** in TypeScript, Python, and Go, generated from a single OpenAPI source of truth.
  - **Idempotency:** every write endpoint accepts an `Idempotency-Key` header; replays within 24 h return the original response.
  - **OAuth 2.1 scopes** (see §6) gate every endpoint; tokens are JWTs signed by Domio with 1-hour TTL and refreshable via rotation.
  - **Rate limits:** see §3.
  - **Async endpoints** for long-running ops (full-deck render #204, batch imports): `202 Accepted` + job id + webhook on completion.
  - **CLI wrapper** (`deckctl`, #231) — a thin convenience over the SDK.
- **Behavioral details / edge cases**
  - **Semantic element addressing** (#226) is exposed: every element has a stable `path` (e.g., `slide[3].chart[revenue_by_region]`); API edits by path survive slide reorders.
  - **Suggestion mode for agents** (#228): a `dry-run` mode on `PATCH /decks/{id}` returns a structured diff without applying it.
  - **MCP convergence:** the REST/GraphQL surface is the same surface the MCP server (#221) exposes as tools — single source of truth, no parallel "agent API."
  - **Versioning:** additive changes bump minor (`v1.3 → v1.4`); breaking changes bump major with 12-month overlap (`v1.x` and `v2.x` both served).
- **Dependencies:** #201 (webhooks), #221–#234 (agentic surface), #204 (async render endpoints), #231 (CLI), #232 (offline SDK mode).

### Feature 201 — Webhooks (deck viewed, comment added, approval granted)

- **Intent:** Let tenants react in near-real-time to events that matter to their systems — CRM sync (#176), legal review triggers (#180), agent workflows (#229).
- **Acceptance criteria**
  - Admin registers a webhook subscription: URL, event filter (list of action types from #196), secret (HMAC), and optional residency zone preference.
  - Delivery is signed (`X-Domio-Signature: t=<ts>,v1=<hmac>`), with a 5-retry exponential-backoff policy (1 m, 5 m, 30 m, 2 h, 12 h), and at-least-once semantics with idempotency keys.
  - Failed deliveries after 12 h are surfaced in a "dead-letter" UI for admin replay.
  - Filtering is server-side: a subscription can express `event.action IN [...]` and `event.target.folder IN [...]`; only matching events are delivered.
- **Behavioral details / edge cases**
  - **Burst control:** a single source event can fan out to many subscribers; the dispatcher batches per subscription (up to 100 events per request) when the subscription is configured for batch mode.
  - **Agent triggers** (#229) are special: a webhook can target a Domio MCP session (e.g., `mcp://agent/<id>/invoke`) instead of an HTTPS URL.
  - **Replay window:** events are stored for 30 days post-creation; admins can replay any window to a specific subscription.
  - **Outbound TLS:** webhook URLs must be HTTPS with a publicly trusted cert; mTLS support is on the roadmap.
- **Dependencies:** #196 (event source), #199 (alert webhooks), #229 (agent-trigger webhooks).

### Feature 202 — Plugin architecture (Figma-grade third-party plugin playbook)

- **Intent:** Let third-party developers extend Domio — canvas plugins, data connectors, export formats, custom element kinds — without compromising security, performance, or brand safety.
- **Acceptance criteria**
  - Plugin manifest (`plugin.json`) declares: id, version, author, declared permissions (`canvas`, `data`, `network`, `storage`, `export`), UI surface (panel/modal/inline), entry points, and a public key for signature verification.
  - Plugins execute in a **double-sandbox**: an iframe (DOM isolation) + Web Worker (CPU isolation), with a capability broker mediating every privileged call.
  - Plugin store with org-private publishing (an enterprise tenant can host its own plugin registry).
  - **Permission tiers:** `minimal` (read-only public schema), `verified` (signed by Domio), `privileged` (requires tenant admin approval per install).
  - Plugins can publish **declarative UI** (custom panels) and **imperative APIs** (data connector calls, renderers).
- **Behavioral details / edge cases**
  - **Supply-chain integrity:** plugins are signed by author + version; tenants can require `verified` or `privileged` only.
  - **Update flow:** plugins ship updates via the manifest `version`; admins can pin a version, opt-in to auto-update within a semver range, or require manual approval per bump.
  - **Resource budgets:** every plugin gets CPU and memory quotas per execution; an `over-quota` event is surfaced in the plugin's own audit log.
  - **Cross-plugin isolation:** plugins cannot read another plugin's storage unless explicitly granted via a `sharedScope`.
  - **Uninstall safety:** uninstalling a plugin does not break existing decks that use its custom element kinds — they degrade gracefully to a "missing plugin" placeholder with a one-click restore prompt.
- **Dependencies:** #196 (install/execute audited), #200 (plugins can call public API on behalf of the user), #201 (plugin events fire webhooks), #203 (custom components can be packaged as plugins), #221 (MCP server exposes plugin install/update as tools).

### Feature 203 — Custom component development kit (build interactive components in code, publish to your org's library)

- **Intent:** Let internal developers build interactive, data-bindable components (#25) in a typed language, package them, version them, and publish them to their org's component library with the same governance as first-party components.
- **Acceptance criteria**
  - Authoring in TypeScript (or compiled JS) using the `@domio/component-sdk` package.
  - Each component declares a **JSON Schema** for its props (#233 function-calling-ready schema); the editor's props panel and the API/agent surface (#221) both consume that schema.
  - Components can declare: `defaultProps`, `dataBindings` (which fields the user can bind to a data source), `interactiveStates` (states for #99), and `renderHints` (GPU hints for #11 zoom).
  - Publishing flow: `deckctl component publish` (or CI integration) produces a signed `.dcomp` package; org admins approve versions; updates follow semver and respect pinning.
  - **SDK versioning:** the SDK has its own release cadence; components declare `minSdkVersion` and are warned at edit time if the host SDK no longer supports them.
- **Behavioral details / edge cases**
  - **Breaking SDK changes** bump the major SDK version; old components keep working on the old API until the host DOM is upgraded past their `minSdkVersion`.
  - **Deprecation window:** when a component API is deprecated, the SDK emits a `deprecation` warning in the editor and a `deprecation` webhook (#201); components have 2 minor SDK releases of warning before hard removal.
  - **Sandboxing:** custom components share the plugin sandbox (#202); they cannot break out of the canvas.
  - **Component marketplace potential:** the SDK is the same shape used by the public community marketplace (#28).
- **Dependencies:** #25 (smart components with props), #37 (design tokens usable from SDK), #99 (component states), #200 (publish flow via API), #202 (sandbox reuse), #226 (semantic element addressing extends to custom components), #233 (function-calling schema).

### Feature 204 — Headless rendering service (deck → image/PDF/video via API)

- **Intent:** A server-side rendering farm that takes a deck id (or a deck schema payload) and produces PNG/JPEG/PDF/MP4 exports at the fidelity of the editor — accessible via API for batch jobs and embedded into workflows.
- **Acceptance criteria**
  - `POST /v1/renders` accepts `{ deckId, format, options }` and returns a `renderJob` with a `jobId`; status polled via `GET /v1/renders/{jobId}` or delivered by webhook (#201).
  - Formats: `png` (per-slide), `jpeg`, `pdf` (with selectable paper size + handout layouts), `mp4` (animations + narration).
  - Render fidelity is editor-equivalent: GPU-accelerated, supports animations (#85–#95), 3D (#65–#74), live charts at a "snapshot moment" (#51), and accessibility overlays (#122).
  - Throughput: see §8.
  - Render options: page range, scenario override (#57), locale override (#61), DPI (96/144/300), custom font upload, watermark.
- **Behavioral details / edge cases**
  - **Snapshot semantics:** a render always captures a deterministic moment; live data (#48) is resolved at `renderStart`, not later.
  - **LLM-side use:** the same service backs the MCP tool `render_slide_to_image` (#222); an agent gets back bytes (or a signed URL with a 1-hour TTL).
  - **Origin restrictions** (security, §7): the renderer runs in a hardened container with no outbound network except the Domio control plane and explicitly allowlisted fonts/CDNs declared in the request.
  - **Animation rendering:** MP4 export uses a frame-blended recorder; for > 60 fps animations, the recording rate is configurable per render (default 30 fps to control size).
  - **Concurrency limits:** per tenant, default 5 concurrent renders; raises with plan.
  - **Cost predictability:** a render pre-flight (`POST /v1/renders:estimate`) returns estimated duration + byte size before commit.
- **Dependencies:** #11 (GPU path), #48 (data resolution at snapshot), #57 (scenario snapshot), #122 (accessibility overlays), #200 (async API surface), #201 (delivery webhook), #221 (MCP tool surface), #232 (offline SDK mode reuses the renderer).

---

## 2. UX Flows

### 2.1 Provisioning users via SCIM

1. Admin opens **Admin Console → Identity → SSO & SCIM**.
2. Admin configures SSO (SAML metadata URL or OIDC discovery) and saves.
3. Admin toggles **SCIM provisioning**, copies the **SCIM base URL** and a freshly generated **SCIM bearer token**, and pastes both into the IdP (Okta → Applications → Domio → Provisioning).
4. IdP begins sending `POST /scim/v2/Users` for each assigned user; Domio ingests, creates seats (#199), and sends `200` with the canonical user payload back.
5. IdP sends `POST /scim/v2/Groups` and `PATCH /Users/{id}` for group changes; Domio applies the **Group → Role mapping** table (e.g., `domio-editors → editor`, `domio-admins → admin`).
6. When a user is unassigned in the IdP, SCIM `DELETE /Users/{id}` arrives; the user's session is revoked within 5 s, seat released, and an `audit_event` recorded.
7. Admin sees live provisioning status on the dashboard ("3 users pending, 142 active, 0 errors").
8. **Edge:** IdP sends a group the tenant doesn't have mapped; the user is created with the tenant's default role and a banner appears: *"Unmapped group: `finance-readonly`. Map it now?"*

### 2.2 Configuring the brand governance dashboard

1. Admin opens **Brand → Governance**.
2. The dashboard first renders with **on-brand score = N/A** and a CTA: *"Connect a brand kit to start scoring."*
3. Admin selects an existing brand kit (#39) or creates one. The score recalculates over all decks and lands within ~60 s for ≤ 1 K decks (or is queued with a progress indicator for larger tenants).
4. Admin opens **Rules**, sees the default rule set (off-palette, off-type, off-template, brand-lock edits, accessibility regressions) and adjusts severities.
5. Admin opens **Ignore list** to add the M&A project folder as exempt from off-palette.
6. Admin configures **Alert threshold** (e.g., notify on Slack when org-wide score drops below 80).
7. Admin drills into a specific violation: a chart on slide 4 of deck X uses `#FF5733`, not the brand `#0A2540`. Clicking **Fix it** opens the editor at that element with a one-click swap.
8. Admin exports the violation report as a CSV (sent to compliance@ via scheduled email — configured under **Schedules**).
9. **Edge:** A new brand kit version is published (#39 versioning). The dashboard re-bases all scores, shows a "diff vs. previous" widget, and emails the brand owner a summary of the biggest movers.

### 2.3 Defining DLP rules

1. Admin opens **Compliance → DLP rules**.
2. The rule list shows shipped packs (PII, Financial, Confidential keywords) toggled on by default.
3. Admin clicks **New rule** → chooses **Match type: regex**, **Scope: data-bound text + alt-text + comments**.
4. Admin enters pattern `(?i)\bNID[-\s:]?\d{10,17}\b` (Bangladesh NID format) with severity `block`.
5. Admin previews against a sample of 25 decks; results show hits per deck with snippet previews (PII auto-masked).
6. Admin enables the rule; the next external share attempt against any matching deck is blocked.
7. Admin sets up **Exception workflow**: blocked share attempts produce a "Request exception" email to the DLP admin group, with one-click approve/deny.
8. **Edge:** A regex matches content inside an embedded chart's tooltip (#49) but the match is for an old, archived dataset. The DLP admin marks the finding "Not PII" with reason "Public dataset, NID format coincidence" — this becomes a tenant-wide allow for that specific dataset id.

### 2.4 Running audit log queries

1. Admin opens **Compliance → Audit log**.
2. The query builder shows: actor (user picker), action type (multi-select), target (deck/folder picker), time range (default last 7 days), residency zone (zone picker).
3. Admin enters `actor = alice@acme.com, action IN [deck.shared, deck.exported], time = last 30 days`.
4. Results return with p95 < 3 s for a 30-day window; each row shows actor, action, target, timestamp, IP.
5. Admin clicks a row to expand: full event JSON, hash chain position (`seq 18,442, prevHash 0xA1B2…`), and a "Verify chain up to here" button.
6. Admin exports the result set as a **signed NDJSON bundle** for legal review; the bundle includes the chain head hash and a Domio signature.
7. **Edge:** Admin searches `payload contains "Project Aurora"`. The free-text index returns 412 events. Admin saves this query as "Project Aurora activity" with a daily email digest.

### 2.5 Configuring data residency

1. Admin opens **Admin Console → Tenant → Residency** during tenant creation or after the 90-day lock.
2. Admin chooses **Primary zone: `eu-west`** and **DR zone: `eu-west-2`**.
3. Admin sees a per-zone **feature availability matrix** and a per-zone **data classification picker** (which content classes — PII, financial, CII — are pinned to this zone).
4. Admin confirms; the change emits a `residency.configured` audit event and the tenant's storage buckets are re-pointed (no data copy required if buckets already exist).
5. Admin opens **Compliance posture** page; sees the SOC 2 Type II report link, GDPR DPA, sub-processor list, breach-notification SLA, and a generated **data-flow diagram** (SVG) for the chosen zone.
6. Admin opens **Data subject requests** and runs a **dry-run DSR (access)** for `user@example.com`; the preview shows exactly what would be exported.
7. **Edge:** A US-only feature is enabled (e.g., a US-residency-only connector). The dashboard flags a "cross-border transfer" and requires the admin to acknowledge an SCC before the feature is allowed.

### 2.6 Building a public API integration

1. Developer opens **Admin Console → API → Consumers** and clicks **New consumer**.
2. Developer names the consumer (`weekly-monday-review-bot`), chooses **OAuth scopes** (e.g., `decks:write`, `renders:write`, `webhooks:read`), and pins residency (`eu-west`).
3. Developer receives a `client_id` and `client_secret`; uses OAuth 2.1 authorization code + PKCE to obtain an access token.
4. Developer runs `POST /v1/decks` with `{ "templateId": "weekly-review", "dataSource": "snowflake://...", "render": { "format": "pdf" } }`; receives `201 Created` with a `deckId` and a `renderJobId`.
5. The render completes ~45 s later; webhook fires `render.completed` with a signed URL to the PDF; developer uploads to Slack.
6. Developer registers a webhook for `deck.viewed` to feed engagement back to their CRM (#176).
7. **Edge:** The bot's OAuth token expires mid-week; the SDK auto-refreshes. If the refresh fails (consumer revoked), the bot surfaces a clear error and stops — no silent retry storm.

---

## 3. Functional and Non-Functional Requirements

### 3.1 SSO protocol coverage

- **SAML 2.0:** metadata-driven config, signed assertions required, encrypted assertions supported (`AES-128`/`AES-256`), `RelayState` validated against an allowlist of return URLs.
- **OIDC:** discovery-driven config, `PKCE` mandatory for public clients, `state`/`nonce` checked, `id_token` signature + `aud`/`iss`/`exp` validated.
- **Just-in-time** vs **pre-provisioned** SCIM: both supported, SCIM authoritative on conflict.
- **Account linking:** if a user previously signed up via password and later SSO arrives, the accounts merge on email match with a confirmation prompt and an audit event.
- **NFRs:**
  - p95 SSO callback round-trip (including IdP round-trip) ≤ 1.5 s.
  - 99.95 % monthly availability for the SSO endpoints (measured per zone).

### 3.2 SCIM provisioning semantics

- Full **SCIM 2.0** conformance for `/Users` and `/Groups`, including `filter` on `userName`, `displayName`, `emails`, `active`.
- Pagination via `startIndex`/`count` and `totalResults`.
- Soft-delete on `DELETE /Users/{id}`; the user becomes `disabled` with sessions revoked.
- **Conflict resolution:** SCIM wins over JIT. Last-writer-wins on field-level SCIM `PATCH`.
- **NFRs:** p95 SCIM `POST /Users` ≤ 300 ms (excluding network to IdP).

### 3.3 RBAC + ABAC layering

- **RBAC** (role-based) is the coarse layer: built-in roles + custom roles with permission grants.
- **ABAC** (attribute-based) is the fine layer: policy expressions like `editor AND deck.folder IN user.allowedFolders AND (deck.brandLockRegions == empty OR user.role == "admin")`.
- **Permission resolution order:** ABAC deny > ABAC allow > RBAC role grants > tenant default.
- **Effect on sharing/brand-lock:** ABAC can prevent a junior editor from editing brand-locked regions even if their RBAC role permits deck edits.
- **NFR:** permission checks must complete in ≤ 5 ms (cached, with cache invalidation on role/attribute change).

### 3.4 DLP scanning performance

- **Budget per share:** ≤ 2 s for a 200-slide deck with ≤ 50 MB of resolved text content.
- **Edit-time rescans:** delta-based; only changed elements are rescanned.
- **Throughput:** a single DLP worker handles ~50 concurrent deck scans at the 2 s budget.
- **Backpressure:** if scan load exceeds capacity, share attempts are queued with a visible "Scanning…" indicator (max 30 s wait) then hard-failed with a retry instruction.

### 3.5 Audit log immutability

- **Append-only at the API layer:** no `UPDATE` or `DELETE` endpoint exists for events; only `redact` (creates a new event referencing the original).
- **Hash chaining:** each event carries `prevHash`; any tampering breaks the chain.
- **Customer verification:** a CLI command (`deckctl audit verify`) recomputes the chain over a window and produces a signed verification report.
- **NFRs:**
  - Append latency: event visible in the log ≤ 500 ms after the source transaction commits.
  - Query latency: p95 ≤ 3 s for a 30-day window with up to 5 filters, at 100 M events.
  - Storage durability: 11 nines (object store replication + quarterly restore drill).

### 3.6 Data residency routing

- **Bucket-level segregation** per zone; no cross-zone replication unless explicitly enabled.
- **Routing at request time:** every request carries a residency claim (from API consumer config, session, or admin override) and is served from the corresponding zone.
- **Cross-zone operations** (e.g., a `eu-west` admin viewing a `us-east` deck for support) require a `cross-zone-acknowledged` flag and are audit-logged.
- **NFR:** residency violation rate ≤ 0.0001 % (measured by control-plane assertions on every storage write).

### 3.7 Retention policy enforcement

- A nightly retention engine evaluates every content item against active policies.
- **Dry-run mode** produces a report without destructive action.
- **Quorum on destructive policy:** any policy that purges > 1 K items or > 10 GB requires a second `compliance-admin` approval.
- **NFR:** retention evaluation completes for the full tenant within 6 h of kickoff for tenants up to 1 M content items.

### 3.8 Usage analytics

- **Pre-aggregated rollups** (daily/weekly/monthly) for fast dashboard load; raw events retained for ad-hoc queries.
- **NFR:** dashboard p95 load ≤ 1 s; export p95 ≤ 10 s for tenants up to 10 K seats.

### 3.9 Public API rate limits and OAuth scopes

- **Rate limits** (per consumer, sliding window):
  - Free tier: 60 req/min, 10 K req/day.
  - Pro: 600 req/min, 500 K req/day.
  - Enterprise: 6 000 req/min, 10 M req/day; burstable to 12 000/min for 60 s.
- **OAuth 2.1 scopes** (selected):
  - `decks:read`, `decks:write`, `decks:delete`
  - `components:read`, `components:publish`
  - `renders:write`, `renders:read`
  - `webhooks:read`, `webhooks:write`
  - `audit:read` (compliance)
  - `admin:org` (org-wide admin actions)
  - `service:full` (MCP/service-account-only; cannot be granted to human users)
- **NFR:** rate-limit checks add ≤ 1 ms per request; over-limit responses are `429` with a `Retry-After` header.

### 3.10 Webhook reliability

- **At-least-once** delivery with idempotency keys.
- **Retries:** 1 m, 5 m, 30 m, 2 h, 12 h, then dead-letter.
- **HMAC signing** with per-subscription secret; rotation supported (two valid secrets during rollover).
- **NFR:** p95 dispatch latency from event creation to outbound HTTP request ≤ 2 s.

### 3.11 Plugin sandboxing

- **Iframe + Web Worker** double-sandbox; capability broker mediates all privileged calls.
- **CPU and memory budgets** per execution; over-quota is `4xx` and audit-logged.
- **No cross-origin network** without an explicit `network` permission and an origin allowlist.
- **NFR:** plugin installation completes in ≤ 3 s; per-execution overhead ≤ 30 ms vs. native.

### 3.12 Custom component SDK versioning

- **Semver** with **2-minor-version deprecation window**.
- `minSdkVersion` declared per component; host editor warns at edit time when SDK is past that point.
- **NFR:** SDK install + component reload ≤ 500 ms.

### 3.13 Headless rendering API

- **Async endpoint** (`POST /v1/renders` → `202` + `jobId`).
- **Queue depth** scales horizontally; tenant concurrency caps enforced.
- **Snapshot determinism:** identical inputs produce byte-identical outputs (within codec noise for MP4).
- **NFR:** p50 render of a 20-slide deck to PDF ≤ 20 s; to MP4 (30 s animation) ≤ 90 s.

---

## 4. Architecture

The enterprise plane is composed of **eleven cooperating services**, each independently deployable, all zone-pinned.

```
                          ┌──────────────────────────┐
                          │  Identity Provider (IdP) │
                          │  (Okta, Entra ID, etc.)  │
                          └─────────────┬────────────┘
                                        │ SAML/OIDC + SCIM 2.0
                                        ▼
┌──────────────┐  ┌────────────────────┴────────────────────┐
│  Admin Web  │──▶  Identity Service (SSO + SCIM + Sessions) │
└──────────────┘  └────────────────────┬────────────────────┘
                                      │ events
                                      ▼
       ┌──────────────┐   ┌──────────────────────┐
       │ Brand Gov UI │──▶│  Brand Governance    │── audit_event ─┐
       └──────────────┘   └──────────────────────┘                │
                                                                  ▼
       ┌──────────────┐   ┌──────────────────────┐    ┌────────────────────┐
       │ DLP Admin UI │──▶│  DLP Engine          │──▶│ Audit Log Service  │──▶ Object Store
       └──────────────┘   │  (regex/classifier)  │    │ (append-only,      │    (zone-pinned,
                          └──────────────────────┘    │  hash-chained)     │     tiered)
                                  ▲                   └────────────────────┘
                                  │ scan request              ▲
                                  │                           │ events
       ┌──────────────┐   ┌────────┴─────────────┐   ┌───────┴────────────┐
       │ Sharing UI   │──▶│  Share/Export Policy │──▶│ Residency Router  │
       └──────────────┘   │  Gate (DLP+ABAC)     │   │ (zone-aware)       │
                          └──────────────────────┘   └────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────┐
                          │ Retention Engine     │──▶ Object Store (purges)
                          │ + Legal Hold Mgr     │──▶ Audit Log
                          └──────────────────────┘

       ┌──────────────┐   ┌──────────────────────┐
       │ Admin Seats  │──▶│  Seat/Usage Analytics│──▶ Audit Log (rollups)
       └──────────────┘   └──────────────────────┘

       ┌──────────────┐   ┌──────────────────────┐   ┌────────────────────┐
       │ API Consumer │──▶│  API Gateway         │──▶│ Webhook Dispatcher │
       │ (REST/GQL)   │   │  (auth, rate-limit)  │   │ (signed, retried)  │
       └──────────────┘   └──────────┬───────────┘   └────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ Plugin Runtime       │──▶ Audit Log
                          │ (iframe + worker)    │
                          └──────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐   ┌────────────────────┐
                          │ Custom Component SDK │──▶│ Headless Renderer  │
                          │ (in-deck / build)    │   │ (image/PDF/MP4)    │
                          └──────────────────────┘   └────────────────────┘
```

### 4.1 Identity Service (`identity-svc`)

- Handles SAML SP, OIDC RP, SCIM 2.0 endpoints, session issuance, JIT.
- **Storage:** Postgres (zones sharded by `residency_zone_id`); Redis for sessions.
- **Stack:** Rust (axum) for protocol hot paths; Node for admin UI proxies.
- **Throughput target:** 5 K SSO callbacks/min, 20 K SCIM ops/min per zone.

### 4.2 Governance Dashboard (`gov-svc`)

- Computes on-brand score by streaming lint results (#46) into a per-tenant aggregation; nightly incremental recompute.
- **Storage:** Postgres for rule definitions; ClickHouse for time-series score history.
- **Stack:** Node + GraphQL (admin UI), Python (scoring workers).

### 4.3 DLP Engine (`dlp-svc`)

- Stateless workers consuming share/export requests.
- Regex + dictionary + optional ML classifier.
- **Storage:** Postgres for rule definitions; Redis for scan-result cache (TTL 10 m).
- **Stack:** Rust workers, gRPC interface; Go for the classifier adapter.

### 4.4 Audit Log Service (`audit-svc`)

- Append-only with hash chain.
- **Storage:** object store (immutable bucket with object lock); columnar store (ClickHouse or equivalent) for query.
- **Stack:** Rust ingest, Postgres for head/metadata, ClickHouse for query.
- **Query API:** GraphQL for admin UI; REST for #200.

### 4.5 Residency Router (`residency-svc`)

- Per-request zone claim; routes to the correct bucket and replica set.
- **Storage:** Postgres for tenant → zone mapping; in-memory cache.
- **Stack:** Rust, sidecar pattern (every service consults via a thin client library).

### 4.6 Retention Policy Engine + Legal Hold Manager (`retention-svc`)

- Nightly cron-driven evaluation; DSR endpoints for #197.
- **Storage:** Postgres for policies/holds; object store for destructive actions.
- **Stack:** Python with a Rust hot path for mass-purge.

### 4.7 Seat/Usage Analytics (`usage-svc`)

- Rolls up audit events into per-seat, per-team, per-day aggregates.
- **Storage:** ClickHouse.
- **Stack:** Python ingestion + Node admin API.

### 4.8 Public API Gateway (`api-gw`)

- REST + GraphQL, OAuth 2.1 + PKCE, rate limiting, idempotency keys.
- **Storage:** Redis (rate-limit counters), Postgres (consumer registry).
- **Stack:** Rust (gateway), Node (GraphQL federation), generated typed SDKs (TS/Python/Go).

### 4.9 Webhook Dispatcher (`webhook-svc`)

- At-least-once, signed, retried, with dead-letter.
- **Storage:** Postgres (subscriptions), Redis (queue), object store (dead-letter).
- **Stack:** Rust dispatcher; signed URL generator is a shared library.

### 4.10 Plugin Runtime (`plugin-rt`)

- Iframe + Web Worker sandbox; capability broker.
- **Storage:** Postgres for plugin registry; object store for plugin bundles (signed).
- **Stack:** TypeScript runtime; admin UI in React.

### 4.11 Custom Component SDK (`component-sdk`)

- `@domio/component-sdk` (TypeScript), `domio-component-sdk` (Python bindings), versioned via npm/PyPI.
- Component packages (`.dcomp`) are signed bundles uploaded via `deckctl component publish`.

### 4.12 Headless Renderer (`render-svc`)

- GPU-accelerated workers (headless Chromium + WGPU for canvas + WebGL).
- **Storage:** Postgres (job state), object store (output), Redis (queue).
- **Stack:** Rust orchestrator, TypeScript+WebGL renderer workers.
- **Concurrency:** default 5/tenant, raises with plan; autoscaling based on queue depth.

---

## 5. Data Model

All schemas below are **logical**; physical indexes are called out where they matter for performance. Foreign keys are logical; physical implementation may use sharding by `tenant_id` and `residency_zone_id`.

### 5.1 `tenant`

```sql
CREATE TABLE tenant (
  id                UUID PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  primary_zone_id   UUID NOT NULL REFERENCES residency_zone(id),
  dr_zone_id        UUID REFERENCES residency_zone(id),
  sso_required      BOOLEAN NOT NULL DEFAULT FALSE,
  scim_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  retention_default JSONB NOT NULL,        -- { drafts_days: 90, audit_years: 7, ... }
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  residency_locked_until TIMESTAMPTZ      -- 90-day immutability window
);
```

### 5.2 `sso_config`

```sql
CREATE TABLE sso_config (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  protocol        TEXT NOT NULL CHECK (protocol IN ('saml','oidc')),
  metadata_url    TEXT,
  metadata_xml    TEXT,
  discovery_url   TEXT,
  client_id       TEXT,
  client_secret_enc BYTEA,                 -- KMS-encrypted
  scopes          TEXT NOT NULL DEFAULT 'openid email profile groups',
  pkce_required   BOOLEAN NOT NULL DEFAULT TRUE,
  jit_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  default_role_id UUID REFERENCES role(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_sso_tenant ON sso_config(tenant_id);
```

### 5.3 `scim_config`

```sql
CREATE TABLE scim_config (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenant(id),
  bearer_token_hash TEXT NOT NULL,         -- sha256 of issued token (raw never stored)
  base_url        TEXT NOT NULL,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE scim_group_role_map (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  idp_group     TEXT NOT NULL,
  domio_role_id UUID NOT NULL REFERENCES role(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.4 `role` + `permission` (RBAC)

```sql
CREATE TABLE role (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES role(id),     -- role hierarchy
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_role_tenant_name ON role(tenant_id, name);

CREATE TABLE permission (
  id        UUID PRIMARY KEY,
  key       TEXT NOT NULL,                  -- 'decks.write', 'audit.read', 'brand.edit', ...
  scope     TEXT NOT NULL                   -- 'deck' | 'org' | 'plugin' | 'api'
);

CREATE TABLE role_permission (
  role_id       UUID NOT NULL REFERENCES role(id),
  permission_id UUID NOT NULL REFERENCES permission(id),
  PRIMARY KEY (role_id, permission_id)
);
```

### 5.5 `policy` (ABAC)

```sql
CREATE TABLE policy (
  id         UUID PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenant(id),
  name       TEXT NOT NULL,
  effect     TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  expr       JSONB NOT NULL,                -- CEL-like expression tree
  targets    JSONB NOT NULL,                -- ['deck.edit','deck.share','deck.export']
  priority   INT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_policy_tenant ON policy(tenant_id);
```

### 5.6 `dlp_rule` + `dlp_scan_result`

```sql
CREATE TABLE dlp_rule (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('block','warn','log')),
  matcher     JSONB NOT NULL,               -- { kind: 'regex'|'keyword'|'dict'|'ml', pattern: ..., dict_id?: ..., ml_id?: ... }
  scope       JSONB NOT NULL,               -- { elementTypes:[...], dataSourceIds:[...], folderIds:[...] }
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  pack_id     TEXT,                          -- 'pii'|'financial'|'confidential'|NULL (custom)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dlp_scan_result (
  id          UUID PRIMARY KEY,
  deck_id     UUID NOT NULL,
  rule_id     UUID NOT NULL REFERENCES dlp_rule(id),
  severity    TEXT NOT NULL,
  match_count INT NOT NULL,
  snippet_redacted TEXT,                     -- masked preview
  status      TEXT NOT NULL CHECK (status IN ('open','overridden','dismissed')),
  rescanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dlp_scan_deck ON dlp_scan_result(deck_id);
```

### 5.7 `audit_event` (append-only)

```sql
CREATE TABLE audit_event (
  seq            BIGSERIAL PRIMARY KEY,     -- monotonic per tenant
  tenant_id      UUID NOT NULL,
  actor_id       UUID,
  actor_kind     TEXT NOT NULL,             -- 'user'|'service'|'agent'|'system'
  session_id     UUID,
  ip             INET,
  user_agent     TEXT,
  action         TEXT NOT NULL,             -- see #196 enum
  target_kind    TEXT,                       -- 'deck'|'user'|'plugin'|...
  target_id      UUID,
  residency_zone UUID NOT NULL REFERENCES residency_zone(id),
  payload        JSONB NOT NULL,
  prev_hash      BYTEA NOT NULL,
  entry_hash     BYTEA NOT NULL,             -- sha256(canonicalJSON({seq,prev_hash,payload,...}))
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_event(tenant_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_event(target_kind, target_id);
-- Updates and deletes are denied at the DB role level; only INSERT and a redacted UPDATE (via separate role) are permitted.
```

### 5.8 `residency_zone`

```sql
CREATE TABLE residency_zone (
  id         UUID PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,          -- 'eu-west','us-east','ap-south','bd-dhaka'
  region     TEXT NOT NULL,                 -- cloud region code
  storage_bucket TEXT NOT NULL,
  feature_availability JSONB NOT NULL,      -- { 'feature.foo': true, ... }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.9 `retention_policy` + `legal_hold`

```sql
CREATE TABLE retention_policy (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  content_class TEXT NOT NULL,              -- 'draft'|'published'|'archived'|'legalHold'|'auditLog'
  rule        JSONB NOT NULL,               -- { 'after_days_idle': 90, 'on_event': 'last_edit', 'action': 'delete'|'anonymize' }
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE legal_hold (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  target_kind TEXT NOT NULL,                -- 'deck'|'folder'|'user'
  target_id   UUID NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at      TIMESTAMPTZ,
  custodian_id UUID,
  matter_ref  TEXT,
  reason      TEXT,
  placed_by   UUID NOT NULL,
  released_by UUID,
  released_at TIMESTAMPTZ
);
CREATE INDEX idx_hold_target ON legal_hold(target_kind, target_id);
```

### 5.10 `seat_assignment`

```sql
CREATE TABLE seat_assignment (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  user_id       UUID NOT NULL,
  role_id       UUID NOT NULL REFERENCES role(id),
  cost_center   TEXT,
  department    TEXT,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  disabled_at   TIMESTAMPTZ,
  UNIQUE (tenant_id, user_id)
);
```

### 5.11 `api_consumer` + `oauth_scope`

```sql
CREATE TABLE api_consumer (
  id             UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenant(id),
  name           TEXT NOT NULL,
  client_id      TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,         -- bcrypt; secret shown once
  residency_zone UUID NOT NULL REFERENCES residency_zone(id),
  rate_limit_tier TEXT NOT NULL,            -- 'free'|'pro'|'enterprise'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at    TIMESTAMPTZ
);

CREATE TABLE oauth_scope (
  id          UUID PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,         -- 'decks.read','decks.write',...
  description TEXT NOT NULL
);

CREATE TABLE api_consumer_scope (
  consumer_id UUID NOT NULL REFERENCES api_consumer(id),
  scope_id    UUID NOT NULL REFERENCES oauth_scope(id),
  PRIMARY KEY (consumer_id, scope_id)
);
```

### 5.12 `webhook_subscription`

```sql
CREATE TABLE webhook_subscription (
  id             UUID PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES tenant(id),
  target_url     TEXT NOT NULL,
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('https','mcp')),
  target_mcp_session UUID,                 -- when target_kind='mcp'
  event_filter   JSONB NOT NULL,            -- { action_in: [...], target_folder_in: [...] }
  secret_enc     BYTEA NOT NULL,            -- KMS-encrypted HMAC secret (rotated via dual-secret)
  batch_mode     BOOLEAN NOT NULL DEFAULT FALSE,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  residency_zone UUID REFERENCES residency_zone(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_delivery (
  id            UUID PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES webhook_subscription(id),
  event_id      UUID NOT NULL,              -- audit_event.id
  attempt_count INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,              -- 'pending'|'delivered'|'failed'|'deadletter'
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error    TEXT
);
CREATE INDEX idx_wh_delivery_status ON webhook_delivery(status, next_attempt_at);
```

### 5.13 `plugin` + `plugin_install`

```sql
CREATE TABLE plugin (
  id              UUID PRIMARY KEY,
  tenant_id       UUID REFERENCES tenant(id), -- NULL for public catalog
  name            TEXT NOT NULL,
  author_id       UUID NOT NULL,
  latest_version  TEXT NOT NULL,
  manifest        JSONB NOT NULL,           -- { id, version, permissions, ui, entry, signature_pubkey }
  tier            TEXT NOT NULL CHECK (tier IN ('minimal','verified','privileged')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plugin_install (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  plugin_id     UUID NOT NULL REFERENCES plugin(id),
  version       TEXT NOT NULL,
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL CHECK (status IN ('pending','active','disabled')),
  installed_by  UUID NOT NULL,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.14 `custom_component_package`

```sql
CREATE TABLE custom_component_package (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,              -- semver
  min_sdk_version TEXT NOT NULL,            -- SDK semver
  props_schema  JSONB NOT NULL,             -- JSON Schema (#233)
  bundle_url    TEXT NOT NULL,              -- signed .dcomp in object store
  bundle_signature BYTEA NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','published','deprecated')),
  published_by  UUID NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_component_tenant_name_version ON custom_component_package(tenant_id, name, version);
```

### 5.15 `render_job`

```sql
CREATE TABLE render_job (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenant(id),
  consumer_id   UUID REFERENCES api_consumer(id),
  deck_id       UUID NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('png','jpeg','pdf','mp4')),
  options       JSONB NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','deadletter')),
  residency_zone UUID NOT NULL REFERENCES residency_zone(id),
  output_url    TEXT,                       -- signed URL with 1-hour TTL
  output_bytes  BIGINT,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_render_status ON render_job(status, created_at);
```

---

## 6. APIs and Contracts

### 6.1 SSO metadata

- **SAML SP metadata** served at `GET /sso/saml/{tenantId}/metadata.xml` — signed XML with `EntityDescriptor`, `KeyDescriptor` (signing), `AssertionConsumerService`, and `NameIDFormat = emailAddress`.
- **OIDC discovery** at `GET /sso/oidc/{tenantId}/.well-known/openid-configuration` — standard OIDC metadata with `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `scopes_supported`, `response_types_supported = ["code"]`, `code_challenge_methods_supported = ["S256"]`.

### 6.2 SCIM endpoints

All under `/scim/v2`; require `Authorization: Bearer <token>` (hashed token compared server-side).

| Method | Path                          | Description |
|--------|-------------------------------|-------------|
| GET    | `/ServiceProviderConfig`      | Capability discovery |
| GET    | `/Schemas`                    | User/Group schemas |
| GET    | `/Users?filter=…&startIndex=…&count=…` | List users |
| POST   | `/Users`                      | Create user (idempotent on `externalId`) |
| GET    | `/Users/{id}`                 | Read user |
| PATCH  | `/Users/{id}`                 | Patch (add/remove/replace ops) |
| DELETE | `/Users/{id}`                 | Soft-disable |
| GET    | `/Groups`                     | List groups |
| POST   | `/Groups`                     | Create group |
| PATCH  | `/Groups/{id}`                | Patch group membership |
| DELETE | `/Groups/{id}`                | Delete group |

`Content-Type: application/scim+json`. Errors are SCIM `{"schemas":["urn:ietf:params:scim:api:messages:2.0:Error"], "status":"...", "detail":"..."}`.

### 6.3 DLP rule CRUD

```
POST   /v1/dlp/rules                 -> create
GET    /v1/dlp/rules                 -> list (filterable by severity, enabled, pack)
GET    /v1/dlp/rules/{id}            -> read
PATCH  /v1/dlp/rules/{id}            -> merge-patch
DELETE /v1/dlp/rules/{id}            -> delete (soft; rules remain in audit)
POST   /v1/dlp/rules/{id}:preview    -> dry-run against sample decks
POST   /v1/dlp/rules/{id}:enable | :disable
```

Request body:

```json
{
  "name": "Bangladesh NID",
  "severity": "block",
  "matcher": { "kind": "regex", "pattern": "(?i)\\bNID[-\\s:]?\\d{10,17}\\b" },
  "scope": { "elementTypes": ["text","chart","comment","altText"], "folderIds": [] },
  "enabled": true
}
```

Response codes: `200`, `201`, `400` (invalid regex), `403` (consumer scope), `429` (preview queue full).

### 6.4 Audit log query

```
POST /v1/audit/query
{
  "actorIds": ["..."],
  "actions": ["deck.shared","deck.exported"],
  "targetKinds": ["deck"],
  "timeRange": { "from": "2026-06-01T00:00:00Z", "to": "2026-07-01T00:00:00Z" },
  "residencyZone": "eu-west",
  "textContains": "Project Aurora",
  "limit": 100,
  "cursor": "..."
}
```

Returns:

```json
{
  "events": [
    { "seq": 18442, "actorId": "...", "action": "deck.shared", "targetId": "...", "createdAt": "...", "payload": { ... } }
  ],
  "nextCursor": "...",
  "chainHead": "0xA1B2C3..."
}
```

- `GET /v1/audit/verify?from=…&to=…` recomputes the hash chain over a window and returns a signed verification report (JSON + detached signature).

### 6.5 Residency route

- Tenant creation: `POST /v1/admin/tenants` with `{ name, primaryZone, drZone, … }`.
- Update zone: `PUT /v1/admin/tenants/{id}/residency` — only allowed if `residency_locked_until` has passed or by a 2-of-3 admin quorum on a force-relocate event.
- Read: `GET /v1/admin/tenants/{id}/residency`.
- Cross-zone access acknowledgement: `POST /v1/admin/tenants/{id}/cross-zone-ack` — required to enable US-only features for an `eu-west` tenant.

### 6.6 Public API surface (REST + GraphQL)

REST base: `https://api.{zone}.domio.app/v1`. GraphQL: `https://api.{zone}.domio.app/graphql`. All endpoints accept `Authorization: Bearer <jwt>` (OAuth 2.1) or `X-Domio-Api-Key` (server-to-server).

**Selected REST endpoints:**

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| POST   | `/decks` | `decks:write` | Idempotent on `Idempotency-Key` |
| GET    | `/decks/{id}` | `decks:read` | Includes resolved schema + bindings |
| PATCH  | `/decks/{id}` | `decks:write` | Merge-patch; `dryRun=true` returns diff only |
| DELETE | `/decks/{id}` | `decks:delete` | Respects legal hold (#198) |
| POST   | `/decks/{id}/versions` | `decks:write` | Named checkpoint |
| GET    | `/decks/{id}/versions` | `decks:read` | Paginated |
| POST   | `/components` | `components:publish` | Upload signed `.dcomp` |
| POST   | `/renders` | `renders:write` | Async, returns `renderJobId` |
| GET    | `/renders/{jobId}` | `renders:read` | Status + signed output URL |
| POST   | `/webhooks` | `webhooks:write` | Create subscription |
| GET    | `/audit/query` | `audit:read` | Compliance scope |

**GraphQL** is a single `/graphql` endpoint with a federated schema. The MCP server (#221) exposes the same schema as MCP tools — single source of truth.

### 6.7 Webhook deliveries

Headers on every delivery:

```
POST <target_url>
Content-Type: application/json
User-Agent: Domio-Webhooks/1.0
X-Domio-Event-Id: <audit_event.id>
X-Domio-Event-Type: deck.viewed
X-Domio-Delivery-Id: <delivery.id>
X-Domio-Timestamp: <unix_ts>
X-Domio-Signature: t=<ts>,v1=<hex_hmac_sha256>
X-Domio-Idempotency-Key: <event.id>
```

Body:

```json
{
  "event": {
    "id": "...",
    "action": "deck.viewed",
    "actor": { "id": "...", "kind": "user" },
    "target": { "kind": "deck", "id": "..." },
    "payload": { ... },
    "createdAt": "2026-07-29T12:34:56Z"
  }
}
```

### 6.8 Plugin manifest

```json
{
  "id": "acme.chartkit",
  "name": "Chart Kit",
  "version": "2.4.1",
  "author": { "id": "...", "name": "Acme Studio" },
  "permissions": ["canvas","data","network:outbound:api.acme.io","storage"],
  "ui": {
    "kind": "panel",
    "entry": "ui/index.html",
    "defaultSize": { "w": 320, "h": 480 }
  },
  "entrypoints": {
    "main": "runtime/main.js",
    "renderer": "runtime/renderer.js"
  },
  "minHostVersion": "1.6.0",
  "signature": {
    "alg": "ed25519",
    "keyId": "...",
    "value": "..."
  }
}
```

The manifest is signed by the author's key; `tier = privileged` plugins additionally require Domio co-signature. Tenants verify both before install.

---

## 7. Security

### 7.1 Encryption

- **At rest:**
  - Postgres TDE (AES-256-GCM).
  - Object store SSE-KMS with customer-managed keys (BYOK via AWS KMS / GCP KMS / Azure Key Vault).
  - Per-tenant DEKs, wrapped by a tenant-root KEK in KMS.
- **In transit:**
  - TLS 1.3 only (TLS 1.2 disabled at the gateway); HSTS preload.
  - Internal service-to-service via mTLS (SPIFFE identities) on a service mesh.
  - SAML/OIDC assertions encrypted when supported by IdP; `client_secret`s are KMS-encrypted at rest and never logged.

### 7.2 Key management (KMS)

- Customer-managed keys (BYOK) supported for tenant data.
- Key rotation: tenant-root KEK rotated annually with overlap window; DEKs rotated quarterly.
- Key escrow: Domio retains no plaintext; key access is auditable per request.

### 7.3 Audit log integrity (hash chaining)

- Each entry's `entry_hash = sha256(canonical_json(seq, prev_hash, payload, ...))`.
- The `seq` is monotonic per tenant; Postgres `BIGSERIAL` is augmented by an in-memory monotonic counter to prevent gaps from rolled-back transactions.
- A `compliance-admin` can run `domio audit verify` (CLI #231) which fetches a window and recomputes the chain; a verification report is signed.
- A weekly **third-party verification** is a deliverable for SOC 2 Type II.

### 7.4 Residency enforcement

- Every storage write asserts `residency_zone_id` via a column-level check constraint matching the bucket.
- Every read uses a residency-aware client library that pins the zone.
- Cross-zone access requires an explicit, audit-logged acknowledgement.
- A nightly control-plane job samples random writes and reads; mismatches trigger a `P0` alert.

### 7.5 Sandbox isolation for plugins

- **Iframe:** unique origin (`sandbox-<tenantId>-<pluginId>.domio.app`), no same-origin policy escape.
- **Web Worker:** no `DOM`, no `window`, no `document`.
- **Capability broker:** mediates `network`, `storage`, `canvas`, `data`, `export`. Each call is logged to `audit_event`.
- **Resource caps:** CPU (ms per 10 s), memory (RSS), storage (bytes), network (req/min).
- **CSP:** strict `default-src 'none'`, `script-src` whitelisted, no inline scripts.

### 7.6 Headless renderer origin restrictions

- Renders run in a hardened container with **no outbound network** by default.
- The request can declare an `allowlist` of font URLs and CDN hosts; each is matched exactly.
- Input deck schema is validated against a strict subset (no `eval`, no `Function`, no `importScripts` of remote URLs).
- Output URLs are signed with 1-hour TTL.
- Rendering jobs are reproducible: identical inputs → identical bytes (within codec tolerance).

### 7.7 Rate limiting and abuse prevention

- **API gateway:** sliding-window per-consumer (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` on 429).
- **Anomaly detection:** unusual export bursts, mass share operations, or token-refresh storms trigger a `P2` alert and an automatic consumer suspension pending review.
- **Bot/abuse:** Cloudflare-style challenge on the public web app; per-IP rate limit on public share endpoints.
- **OAuth abuse:** refresh token rotation with reuse detection (RFC 6819 §5.2.2.3); a reused refresh token invalidates the entire token chain.

---

## 8. Performance

### 8.1 Audit log query latency

- **Hot path:** ClickHouse-backed columnar store, partitioned by `tenant_id` and `created_at` (monthly partitions).
- **Indexes:** sorted by `(tenant_id, created_at)`; secondary bloom-filter on `action`, `target_kind`, `actor_id`.
- **p50/p95/p99 targets** for `POST /v1/audit/query`:
  - 1-day window: 100 / 400 / 900 ms
  - 30-day window: 600 / 2 800 / 6 000 ms
  - 90-day window: 1 500 / 6 000 / 14 000 ms
- Throughput target: 200 concurrent audit queries per zone with p95 < 5 s.

### 8.2 DLP scan budget per share

- **Share:** p95 ≤ 2 s for a 200-slide deck with 50 MB resolved text; p99 ≤ 4 s.
- **Edit-time delta rescan:** p95 ≤ 200 ms per changed element.
- **Scan worker throughput:** ~50 concurrent deck scans per worker at the 2 s budget.
- **Auto-scaling:** workers scale on queue depth with HPA target 30 s backlog.

### 8.3 Headless render queue scaling

- **Throughput target:** 1 000 concurrent renders per zone at peak.
- **p50/p95 per format** (20-slide deck):
  - PNG per slide: 1 s / 3 s
  - PDF: 8 s / 20 s
  - MP4 (30 s animation, 1080p): 30 s / 90 s
- **Queue:** Kafka-backed with priority lanes (`interactive` < 5 s SLA, `batch` < 5 m SLA).
- **Autoscaling:** HPA on CPU + queue depth; GPU pool autoscales independently.

### 8.4 API gateway throughput

- **Targets:** 50 K req/s steady-state per zone, 200 K req/s burst for 60 s.
- **Latency overhead:** p99 added by gateway ≤ 5 ms.
- **Backpressure:** 503 with `Retry-After` when downstream queue exceeds thresholds.

---

## 9. Observability and Testing

### 9.1 Observability

- **Structured logs:** JSON with `trace_id`, `tenant_id`, `actor_id`, `residency_zone`. PII masked by the DLP engine.
- **Metrics:** RED (Rate, Errors, Duration) for every service; USE (Utilization, Saturation, Errors) for GPU workers.
- **Tracing:** OpenTelemetry, sampled at 10 % by default, 100 % for `4xx`/`5xx` and for `#196` actions tagged `priority=high`.
- **Audit log health:** dashboard for append rate, hash chain verification status, dead-letter queue depth.
- **Alerts:**
  - `P0`: residency violation, hash-chain break, DLP bypassed, audit-log write failure.
  - `P1`: render queue backlog > 5 m, webhook dead-letter > 1 % of deliveries, SSO error rate > 1 %.
  - `P2`: API rate-limit exhaustion by a top-10 consumer, unusual export bursts.

### 9.2 Compliance drills (quarterly)

- **DR drill:** restore audit log from object store into a fresh region; verify hash chain intact; measure RTO/RPO.
- **DSR drill:** run a full `access` then `erasure` DSR against a synthetic user; verify the data is gone from production, backups, and object stores within the documented window.
- **Legal hold drill:** place a hold on a folder, attempt to delete a deck, verify the deletion is blocked; release and verify retention cascade.
- **Residency drill:** attempt to write to a forbidden zone via an admin bypass; verify the control-plane job catches it within 24 h.

### 9.3 Penetration test plan

- **Annual third-party pen test** scoped to:
  - SAML signature stripping, OIDC token replay, SCIM auth bypass.
  - Audit log tamper attempts (modify Postgres, append without seq, break hash chain).
  - Plugin sandbox escapes (DOM access, network exfiltration, prototype pollution).
  - Headless renderer SSRF and JS injection (via deck schema).
  - Webhook signature forgery and replay.
  - ABAC policy escape via crafted permission grants.
- **Findings** feed a tracked remediation backlog with SLA: P0 = 7 days, P1 = 30 days, P2 = 90 days.
- **Continuous testing:** bug bounty program with a triage SLA of 48 h for P0/P1.

### 9.4 Load testing

- **Synthetic workloads** in CI for: audit-log query, DLP scan, render queue, webhook dispatcher, API gateway.
- **Production mirror** quarterly at 2× peak to validate auto-scaling and residency controls.
- **Chaos engineering:** randomly kill a worker, inject latency into KMS, fail the SCIM endpoint; verify graceful degradation.

---

## 10. Cross-Section Ties

### 10.1 Editor (section 1, #1–22)

- Every editor action emits an `audit_event` (#196) via the outbox pattern.
- CRDT state (#21) is **retained for 30 days post-deprovision** (#193) so a returning user sees their last canvas.
- **Brand-lock** regions (#36) are enforced by the same ABAC engine (#3.3) that decides if an editor can save a change.
- **Autosave** (#22) is rate-limited at the API gateway (#3.9) — bursty editors see "saving…" instead of `429`.

### 10.2 Brand governance → theming (section 3, #37–47)

- The on-brand score (#194) is a rollup of **style lint** results (#46), which itself consumes the **design tokens** (#37), **brand kit** (#39), and **accessibility** checks (#44).
- **One-click theme swap** (#38) is the write-side complement: it changes tokens and re-runs the lint, updating the score.
- **Theme marketplace** (#45) listings are subject to governance — public marketplace listings go through a verification tier (#202).

### 10.3 DLP → data (section 4) and sharing (section 11, #155–168)

- **DLP** (#195) operates on **resolved** data — i.e., data-bindings (#48) are fetched and the **values**, not the references, are scanned. This is the only way PII inside a chart actually shows up in the scan.
- **Data source access control** (#64) is upstream: DLP does not need credentials, but it depends on the access-control layer to know what's safe to even resolve.
- **Per-link content control** (#159) is gated by DLP: a `block` rule short-circuits the share. **Expiring links** (#158) and **per-viewer watermarking** are layered on top.
- **Export pipeline** (#164) is the second DLP gate — DLP runs at export time as well as share time.
- **Public decks** (#165) and **embeds** (#161) can be tagged `public-shareable` to opt out of `block` rules; admins can forbid that override.

### 10.4 Residency → legal (sections 11 & 12)

- **Residency** (#197) operationalizes the PDPA / GDPR constraints surfaced in §11 of the planning guide. The compliance posture page is the customer-facing counterpart to the law's requirements.
- **Bangladesh PDPA specifically:** `bd-dhaka` residency supports a synchronized real-time local mirror for restricted / CII data; the residency router enforces that mirror.
- **Discretionary relocation** (planning guide §11.2) is operationalized as the `residency.relocate` admin endpoint requiring 2-of-3 admin quorum.
- **Cross-border transfer guardrails** map to ABAC policies (#3.3): a US-only feature enabled on an `eu-west` tenant must satisfy a `policy` with effect `allow` and `targets = ['feature.us-only-connector']`.

### 10.5 Audit log → collaboration (section 13, #179–192)

- Every comment (#179), review action (#180), assignment (#181), suggestion (#182), merge request (#183), and approval (#180) emits an `audit_event` with `action` set accordingly.
- **Review/approval workflows** (#180) integrate with DLP: an external-share approval can require DLP pre-clearance.
- **Auto-updating shared slides** (#186) emit `deck.updated` events that feed downstream webhooks (#201); the audit log records the source-of-truth update.
- **Guest collaborators** (#192) are scoped via ABAC; their session is reflected in audit events with `actor_kind = guest`.

### 10.6 Public API → agentic surface (section 16, #221–240)

- **#200 is the precursor** to the agentic surface. The REST/GraphQL schema is the single source of truth; the MCP server (#221) is a thin projection that exposes the same operations as MCP tools.
- **#226 (semantic addressing)** stabilizes agent edits across slide reorders and is enforced by the same path addressing in the API.
- **#227 (agent audit trail)** is implemented by tagging every API call with `actor_kind = 'agent'` (or `'service'`) so the audit log distinguishes human vs. machine.
- **#228 (dry-run)** is `PATCH /decks/{id}?dryRun=true` returning a structured diff — same shape as the human suggestion mode (#182).
- **#229 (webhooks → agent triggers)** is a webhook subscription with `target_kind = 'mcp'` and `target_mcp_session = …`.
- **#231 (CLI)** is `deckctl`, a thin wrapper over the SDK; its commands are 1:1 with REST endpoints.
- **#233 (function-calling schemas)** are the JSON Schemas in `custom_component_package.props_schema` — agents read the same schema the editor uses to render the props panel.
- **#234 (natural-language patch API)** is a higher-level wrapper that, internally, calls multiple granular tools; its audit trail includes the full tool-call transcript.
- **#236 (capability discovery)** is `GET /v1/.well-known/domio` plus `GET /v1/openapi.json` plus `POST /graphql { __schema }` — the same data agents consume.
- **#240 (diffing API)** is `GET /v1/decks/{id}/diff?against={versionId}` returning a structured diff for agent decision-making.

---

## Coverage Report

- **File path:** `/home/daiyaan2002/Desktop/Projects/domio/docs/enterprise-governance.md`
- **Features covered:** 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204 (12 of 12 — full section 14).
- **Sections delivered:**
  1. Feature-by-feature mapping (acceptance criteria, behavioral details, edge cases, dependencies) — done.
  2. UX flows (SCIM provisioning, governance dashboard, DLP rules, audit log queries, data residency, public API integration) — done.
  3. Functional and non-functional requirements (SSO, SCIM, RBAC+ABAC, DLP, audit immutability, residency routing, retention, seat analytics, API rate limits, webhook reliability, plugin sandboxing, SDK versioning, headless rendering) — done.
  4. Architecture (12 services with stack, storage, and throughput targets) — done.
  5. Data model (15 tables: `tenant`, `sso_config`, `scim_config`, `role`/`permission`, `policy`, `dlp_rule`/`dlp_scan_result`, `audit_event`, `residency_zone`, `retention_policy`/`legal_hold`, `seat_assignment`, `api_consumer`/`oauth_scope`, `webhook_subscription`/`webhook_delivery`, `plugin`/`plugin_install`, `custom_component_package`, `render_job`) — done.
  6. APIs and contracts (SSO metadata, SCIM endpoints, DLP CRUD, audit query, residency, public API REST+GraphQL, webhook signatures, plugin manifest) — done.
  7. Security (encryption at rest/in transit, KMS, hash chain, residency enforcement, plugin sandbox, renderer origin restrictions, rate limiting + abuse) — done.
  8. Performance (audit log latency, DLP budget, render queue, API gateway) — done.
  9. Observability and testing (metrics, alerts, compliance drills, pen test plan, load testing) — done.
  10. Cross-section ties to sections 1, 3, 4, 11/12, 13, 16 — done.
- **Source files modified:** none (read-only).
- **Git commit:** not made (per instructions).