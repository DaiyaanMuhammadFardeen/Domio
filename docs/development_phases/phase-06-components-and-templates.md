# Phase 06 — Components & Templates Ecosystem

| Field | Value |
|---|---|
| **Phase number** | 06 |
| **Name** | Components & Templates Ecosystem |
| **Owner(s)** | Stream A lead (registry-service), Designer/UX (panel + marketplace UX), Frontend lead (prop panel + render integration) |
| **Critical path?** | No (deepening) |
| **Parallel stream** | **Stream A — Ecosystem** (runs parallel with P07, P08, P09, P10, P11, P12, P13 after P05 ships) |
| **Unblocks** | P14 (Sharing), P15 (Presenter), P19 (Marketplace — billing/payout layer), P20 (lock-region enforcement reads brand_lock_region) |

**Intent.** Turn the canvas into a Canva-scale authoring surface by delivering the component registry, smart components with JSON-Schema-driven editable props, variants, the promote-to-component flow, user/team component libraries with publish/subscribe semantics, the full-deck and section template engines, the icon/media/animation/sticker libraries, and brand-locked templates. The phase lands the structural machinery that every later "deepening" and "surface" phase builds on: #25's prop schema becomes the canonical contract for the AI copilot (P12) and the MCP tool surface (P13); #27's library sync model is reused for theme libraries in P07; #28's marketplace plumbing provides the foundation for P19's billing/payout layer. Marketplace billing and payout specifically land in P19; this phase delivers listings, install, license grants, and the revenue-share event ledger but stops short of payout execution.

> **Phase 06 status (shipped).** All seven workstreams delivered.
> Sub-phase 1: `component` scene-graph kind + validation; `@domio/schema-prop` prop engine
> (Fast-Check tested); `@domio/components` curated catalog (25 components with props
> schemas, light/dark variants, SVG builders); `PropEditOp`/`VariantChangeOp` CRDT ops;
> `ElementSvg` renderer upgrade; Magic UI chrome (Tailwind + `motion`, adapted `MagicCard`
> + `Marquee`); Insert → Components panel and schema-driven PropsPanel wired into the
> editor. Sub-phase 2: `services/registry` (Hono) with content-addressed bundle store
> (SHA-256 verified), signed URLs, catalog + pins + variants, install round-trip, license
> module (JWS + offline grace + seats), team libraries (event log + replay + policies +
> webhooks), marketplace (listings lifecycle, reviews + moderation, revenue ledger, search),
> templates (engine + sections + brand locks + SVG poster renderer), media (icons + stock +
> Lottie/GIF + stickers), 7 workers, HTTP transport (7 route groups), MCP tool surface
> (13 tools + agent audit). Migrations 0011–0016, 7 protos, 2 JSON schemas, ADRs 0005–0008,
> i18n (7 locales), axe a11y, Playwright E2E smoke. 542 registry tests at 84% line coverage.

---

## 1. Goals

- A designer can insert any of ≥ 10,000 catalog components (#23) into a slide and edit it through a typed props panel (#25) without leaving the canvas, with sub-100 ms perceived latency.
- A user can promote any selection on the canvas to a reusable component (#26), share it to a team library (#27), and have it propagate as an instance — overrides survive updates.
- A workspace admin can install a full-deck or section template (#29–31), run a guided fill-in walk, and inherit any brand-locked regions (#36) with the locks enforced client- and server-side.
- The Insert → Media / Animations / Stickers panels surface ≥ 100 k icons (#32), multi-provider stock media (#33), Lottie/GIF animations (#34), and sticker packs (#35) with proper attribution, license tracking, and offline-availability guarantees.
- The component/template ecosystem exposes a stable MCP tool surface (#222, #233) and respects agent-scoped permissions (#225), so an external agent can install, describe, and apply components without bypassing brand-lock.
- Telemetry, license checks, and audit logs (#196, #227) are in place such that the marketplace plumbing can be activated in production-ready mode for the P19 billing layer.

---

## 2. Scope

### 2.1 In scope (feature numbers)

| # | Feature |
|---:|---|
| 23 | 10,000+ pre-built components (cards, stats, timelines, org charts, quotes, agendas, comparison tables, roadmaps, and more) |
| 24 | Component variants — light/dark, sizes, states — switchable in one click |
| 25 | Smart components with editable props panel (JSON Schema) |
| 26 | User-created components (create-component flow, master/instance model, prop inference) |
| 27 | Shared team component libraries (publish/subscribe, version pinning, update notifications) |
| 28 | **Marketplace plumbing** — listings, install, license grants, revenue-share events, refunds (billing/payout execution deferred to P19) |
| 29 | Template gallery by use case (pitch, board, QBR, all-hands, classroom, keynote, product demo) |
| 30 | Full deck templates with placeholder logic and guided fill-in |
| 31 | Section templates (team slide, financials section, spreadable sections) |
| 32 | Icon library — ≥ 100 k icons, multiple styles, recolorable, perceptual-hash search |
| 33 | Stock photo/video/illustration integrations (Unsplash, Pexels, plugin interface) |
| 34 | GIF and Lottie animation library |
| 35 | Sticker / annotation packs |
| 36 | Brand-locked templates — enforced client + server, agent-aware |

### 2.2 Out of scope

- **Full marketplace billing and payout execution** — #28's deferred portion lands in P19. This phase emits `revenue_share_event` rows and signs license JWTs but does **not** run monthly payout jobs, integrate Stripe Connect transfer execution, or handle bKash/Nagad disbursement. The schema and event surfaces are present; the worker that moves money ships later.
- **Theme marketplace surface** — feature #45 (the public catalog of community themes) is owned by P07. The data model and install path are reused from this phase's marketplace, but listings, demo renderer, and the public marketplace UI land in P07.
- **Brand governance dashboard** — feature #194 (read-only consumption of brand-lock violations, audit rollups) lives in P20.
- **Sales-mode notifications, CRM sync, deck update propagation** — those are P14 / P17 concerns.
- **AI-driven component generation, AI redesign, copy assistant** — those are P12 (AI copilot); P06 ships a schema that P12 can call into but does not build AI services.
- **Brand kit / theme engine** — P07.
- **Live-data bindings on smart component props** — the `dataBinding` prop shape is defined here (matches §4.2 of `/docs/components-templates.md`); the resolver, the binding picker, and the cross-chart filter plumbing ship in P08.

---

## 3. Dependencies

### 3.1 Upstream phases (must be complete)

- **P00** — repo, contracts, dev env (`contracts/proto/domio/v1/common.proto` provides the UUID/timestamp conventions and `Idempotency-Key` style header semantics reused by install endpoints).
- **P01** — observability, CI/CD, infra (Prometheus, OTel, S3-compatible object store in MinIO for content-addressed bundles, multi-region CDN scaffold).
- **P02** — deck schema + scene-graph foundation (`packages/schema` exposes `DeckSchema`, `ElementSchema`).
- **P03** — canvas editor MVP (`/apps/canvas` exists, with the prop panel slot, the layers panel, and auto-layout containers).
- **P04** — CRDT + presence (the multiplayer channel that propagates `component.variant_changed` and `prop.edited` ops).
- **P05** — persistence, versioning, branches (events feed `audit_component_event`; branches let a designer fork a master component into a draft).

### 3.2 Downstream phases this unblocks

- **P07** — reuses `marketplace_listing`, `license_grant`, `revenue_share_event` for the theme marketplace (#45).
- **P12** — reads `component.props_schema` for structured-output tool calling (#233) and the natural-language patch API (#234).
- **P13** — agentic MCP surface wraps the registry APIs in MCP tools (#221, #222); the `brand_lock_region` enforcement at the API boundary here is what #225 calls into.
- **P14** — share-link / export-job APIs emit marketplace install events into the share payload; brand-locked templates gate shareable-export rules.
- **P15** — presenter view reads smart-component props for live annotations and the recap API.
- **P17** — telemetry from this phase feeds feature #174 (team analytics on components/templates).
- **P19** — picks up marketplace billing/payout execution against the `revenue_share_event` ledger and `license_grant` rows produced here.
- **P20** — enterprise governance dashboard reads `brand_lock_region`, `license_grant`, and `audit_component_event` for the audit rollups and DLP rules.

---

## 4. Workstreams

The phase is organized into six workstreams. Tasks within each are ordered; the **DoD** at the end of every task is what the tech lead uses to mark the task done.

### 4.1 WS-COM-1 — Component registry core

**Tasks (ordered):**

1. **Component package schema (`contracts/schema/component-package-v1.schema.json`).**
   - Files: `contracts/schema/component-package-v1.schema.json`, `contracts/proto/domio/v1/component_registry.proto`.
   - Contract added: `ComponentManifest` (catalog_id, version semver, license_id, deps[], package_hash, signing_key_id, signature).
   - Tests: AJV validation suite — valid + boundary cases for each `kind` (`component | icon | sticker | animation`); tampered-hash rejection.
   - **DoD:** schema validates 10 hand-authored packages; CI runs AJV in `contracts/`.

2. **`registry-service` skeleton.**
   - Files: `services/registry/src/main.rs` (or Node), `services/registry/src/{catalog,bundles,props,sync,marketplace,moderation,analytics}/mod.rs`.
   - Tables: `component`, `component_variant`, `smart_component_prop`, `user_library`, `team_library`, `team_library_event` (see §5).
   - Tests: unit ≥ 80 % line coverage on `catalog` and `props` modules; integration test for install round-trip with content-hash verification.
   - **DoD:** `POST /v1/components/{catalog_id}/install` returns a license grant; tampered hash returns 409.

3. **JSON Schema prop engine (`packages/schema-prop`).**
   - Files: `packages/schema-prop/src/{index,format,resolver,validator}.ts`.
   - Contract consumed: `ComponentManifest.props_schema`.
   - Tests: Fast-Check property tests — randomly generated schemas × values round-trip; UI snapshot test for the prop panel on the canonical stat-card.
   - **DoD:** `validate(schema, value)` runs in < 5 ms p99 for schemas ≤ 40 props; rejects extra props when `additionalProperties: false`.

4. **Content-addressed bundle store + signed URLs.**
   - Files: `services/registry/src/bundles/`, `workers/cdn-signer/`.
   - Storage: `s3://domio-assets/components/{catalog_id}/{version}/...` per §5.1 of `/docs/components-templates.md`.
   - Tests: upload → fetch round-trip; signed-URL TTL honored.
   - **DoD:** signed URLs default to 5-min TTL; free bundles use long-lived immutable URLs; the S3 layout matches the spec exactly.

### 4.2 WS-COM-2 — Smart components, variants, prop panel

**Tasks:**

1. **Prop panel UI (`apps/canvas/src/panels/PropsPanel.tsx`).**
   - Consumes: `ComponentManifest.props_schema`, `smart_component_prop` rows (pre-indexed for control hints).
   - Controls per JSON-Schema type: `string → text/number`, `boolean → toggle`, `enum → segmented`, `array → repeatable`, `object → nested`, `oneOf/anyOf → discriminated union`.
   - Tests: Storybook stories for each control type; a Playwright test renders the stat-card prop panel in < 50 ms p95.
   - **DoD:** panel renders for any schema up to 40 props within 50 ms p95; required props marked with asterisk; pagination kicks in past 40.

2. **Variant engine.**
   - Files: `services/registry/src/catalog/variants.rs`, `apps/canvas/src/render/variantResolver.ts`.
   - Variant switching emits a single CRDT op `component.variant_changed` (no new CRDT type).
   - Tests: variant remap precedence (instance override > variant matrix > master defaults); missing-prop warning on old schema versions.
   - **DoD:** switch variant on a 200-slide deck in < 100 ms p95; lint warns on deprecated variant remaps.

3. **Create-component flow (promote to component).**
   - Files: `apps/canvas/src/actions/createComponent.ts`, `services/registry/src/catalog/promote.ts`.
   - Prop inference walks selected subtrees: text → string, image → asset, color → color, number → number; asks "keep data binding on instance or move to prop?" when a data widget is selected.
   - Tests: snapshot of inferred props on 6 fixture selections; unit tests on the inference heuristics; integration test blocks promotion crossing a brand-locked region.
   - **DoD:** user can promote, rename, reorder, and save a new component; appears in "My library"; detach-from-component works.

4. **Master/instance model + version pinning.**
   - Files: `apps/canvas/src/crdt/componentInstance.ts`, `packages/schema/src/component-instance.ts`.
   - Pin modes: `track-latest`, `pin-version`, `pin-range`, `workspace-managed`.
   - Tests: pinned instance survives a major version bump; unpinned instance follows "latest" deterministically.
   - **DoD:** "Update available" badge shows when workspace policy differs from pinned; bulk "Update all" / "Update none" actions exist; the offline fallback path renders the last-fetched bundle when pin target is gone.

### 4.3 WS-COM-3 — Team libraries and sync protocol

**Tasks:**

1. **Library event log + sync worker.**
   - Files: `services/registry/src/sync/libraryLog.ts`, `workers/library-sync/src/index.ts`.
   - Schema: `team_library_event` (`{ id, library_id, seq, kind, component_id, version, payload_ref, actor_id, created_at }`).
   - Tests: multi-subscriber concurrent apply is deterministic; offline replay idempotent on `(library_id, seq)`; two publishers bumping incompatible versions resolve by workspace policy.
   - **DoD:** an update propagates to subscribers within 60 s; offline clients queue and apply on reconnect with a "pending library sync" badge.

2. **Library policy modes.**
   - Modes: `latest`, `patch`, `minor`, `pinned`; admin-configurable per workspace.
   - Tests: minor policy updates within minor range, blocks major; pinned mode rejects install of newer versions.
   - **DoD:** admin UI exposes policy per team library; a workspace-scoped policy update emits an audit row.

3. **Update notifications + activity feed entries.**
   - Files: `services/registry/src/sync/notifications.ts`, `apps/notifications/src/consumers/libraryUpdates.ts`.
   - Channel: in-app toast + the workspace activity feed row; webhook fanout per feature 201 (`component.installed`, `component.updated`).
   - Tests: webhook payload signed with HMAC over body; replay rejected; activity feed row created with correct `actor_kind`.
   - **DoD:** a 200-instance deck shows per-instance badges that aggregate to a bulk update affordance.

### 4.4 WS-COM-4 — Marketplace plumbing (without payout execution)

**Tasks:**

1. **Listing schema + lifecycle.**
   - Files: `services/registry/src/marketplace/listings.ts`, `contracts/schema/marketplace-listing-v1.schema.json`.
   - States: `draft → in_review → published → deprecated → removed`; review moderation pipeline triggered on transition to `in_review`.
   - Tests: state transitions rejected out of order; `removed` listing keeps installed instances rendering.
   - **DoD:** a creator can draft, submit, and publish a listing; status transitions write audit rows.

2. **License grant issuance + verification.**
   - Files: `services/registry/src/license/{signer,verifier}.ts`, `workers/license-signer/`.
   - License token = JWT signed by the license service, claims `{ sub, listing_id, license_id, seats, exp, iat, jti, device_fp }`.
   - Tests: expired token rejected; revoked token rejected; seat-count enforcement on enterprise grants; tampered signature rejected.
   - **DoD:** every render of a paid component hits `POST /v1/license/verify`; offline grace period is 30 days (NFR-COM-11); re-verification surfaces a non-blocking warning after 30 days.

3. **Revenue-share ledger (deferred payout).**
   - Files: `services/registry/src/marketplace/revenueShare.ts`, `workers/payout-ledger-writer/`.
   - Writes `revenue_share_event` rows on every paid install; payout execution deferred to P19 (the worker that turns `payout_status='eligible'` into actual transfers ships later).
   - Tests: ledger append-only; refund decrements pending payout; currency stored as integer cents per §5.7 of `/docs/pre-development-planning-guide.md`.
   - **DoD:** every install writes one ledger row in a single Postgres transaction with the install; refund flow decrements the row's `payout_status` to `refunded`.

4. **Reviews + moderation pipeline.**
   - Files: `services/registry/src/moderation/{reviews,profanity,spam}.ts`, `workers/review-moderator/`.
   - Pipeline: profanity → spam heuristics → trust score → sentiment; auto-flag queue for human review (24 h SLA).
   - Tests: synthetic spam corpus blocked; verified-buyer badge attaches only when `license_grant` exists.
   - **DoD:** review submit returns 201 + queued status; auto-flag triggers within 30 s (NFR-COM-8).

5. **Marketplace search (read-side).**
   - Files: `services/registry/src/marketplace/search.ts`, `services/registry/src/search/{indexer,query}.ts`.
   - OpenSearch index, sharded per locale; Redis read-through cache for top 1 % queries.
   - Tests: cold query < 1.2 s p95; warm query < 400 ms p95; indexing lag < 60 s.
   - **DoD:** `GET /v1/marketplace/listings` with all facets returns within budgets.

6. **Plugin interface for stock providers (`StockProvider`).**
   - Files: `services/registry/src/plugins/stock/{interface,unsplash,pexels}.ts`.
   - Plugins register via the platform plugin SDK (#202 stub from P01); each provides `search()`, `fetch()`, `attribution()`.
   - Tests: rate-limited provider returns cached + "Results may be stale" banner; provider takedown replaces asset with placeholder.
   - **DoD:** Unsplash and Pexels plugins load and pass contract tests; provider removal propagates "Removed by source — please replace" placeholder.

### 4.5 WS-COM-5 — Templates, placeholders, brand-locked regions

**Tasks:**

1. **Template engine.**
   - Files: `services/registry/src/templates/{engine,installer,placeholders}.ts`.
   - Templates are structured `deck.json` documents (the same `DeckSchema` from P02) plus a `manifest` block and `placeholders[]` array.
   - Tests: malformed template rejected at upload; placeholder validation confirms each resolves to a real element.
   - **DoD:** install deep-copies the template, replacing `placeholder` elements with their `default_value`; "Guided fill-in" mode walks placeholders in narrative order.

2. **Section templates + spreadable insertion.**
   - Files: `services/registry/src/templates/section.ts`, `apps/canvas/src/actions/insertSection.ts`.
   - A section template is a `template` row with `kind = 'section'` and a `slides[]` array; spreadable sections can be inserted multiple times.
   - Tests: insert into deck with conflicting theme ships with explicit overrides + diff dialog; missing component from a removed team library surfaces a "Missing components — partial render" warning.
   - **DoD:** a "Team" section template can be inserted into any deck and parameterized by team member list.

3. **Brand-locked regions (`brand_lock_region`).**
   - Files: `services/registry/src/templates/locks.ts`, `apps/canvas/src/crdt/lockEnforcement.ts`, `services/registry/src/marketplace/lockGate.ts`.
   - Lock scopes: `slide | element | region`; strictness: `strict | color-only | text-only`; allowed_overrides per scope.
   - Tests: every (scope, strictness, allowed_overrides) combination; MCP agent attempting to edit a locked region returns `ERR_BRAND_LOCK` (forward-compatible with #225).
   - **DoD:** a drag of a locked region's logo is rejected client-side; server enforces the same selectors on CRDT writes; admin lock-bypass is recorded in `audit_component_event`.

4. **Headless template preview renderer.**
   - Files: `workers/template-preview-renderer/` (Playwright + the Domio headless render binary).
   - Output: a 10-second MP4/WebM loop and a 1-frame poster per listing.
   - Tests: previews render in < 30 s p95 for a 12-slide template; storage at `s3://domio-assets/previews/{listing_id}/`.
   - **DoD:** every marketplace listing has a poster and a loop; the gallery falls back to the poster when bandwidth is constrained.

### 4.6 WS-COM-6 — Icon, media, animation, sticker libraries

**Tasks:**

1. **Icon library ingestion.**
   - Files: `workers/icon-importer/`, `services/registry/src/icons/{index,search}.ts`.
   - Ingest ≥ 100 k icons from a curated source set (e.g., Phosphor, Lucide, Tabler, Iconoir); each stored as compact SVG path data + metadata (styles, synonyms).
   - Tests: trigram search on names and synonyms returns in < 100 ms; perceptual-hash similarity search for "find an icon that looks like…" returns in < 600 ms p95.
   - **DoD:** a designer can search "trend up arrow," see results across 4 styles, recolor via token, and insert.

2. **Stock media plugins (Unsplash + Pexels).**
   - Files: `services/registry/src/plugins/stock/{unsplash,pexels}.ts` (uses WS-COM-4 task 6).
   - Tests: attribution metadata populated; mirrored-to-CDN path follows `s3://domio-assets/media/{asset_uuid}/{ext}`.
   - **DoD:** inserting an Unsplash image records `credits[]` and the license; offline render works for ≥ 30 days (NFR-COM-11).

3. **Lottie + GIF library.**
   - Files: `services/registry/src/animations/{validate,ingest,index}.ts`, `apps/canvas/src/render/lottie/{runtime,recolor}.ts`.
   - Lottie files validated server-side: license + author + malware scan (forbid `ks` script features regardless).
   - Tests: recoloring respects design tokens; reduced-motion mode honored at runtime; GIF transcoded to MP4/WebM on upload.
   - **DoD:** inserting a Lottie recolors via the active brand palette; exceeding bundle budget shows a warning with a lower-fps option.

4. **Sticker packs.**
   - Files: `services/registry/src/stickerPacks/{list,install}.ts`.
   - Packs carry `informal_only` flag; informal packs in strict-governance workspaces emit a soft warning + lint finding (#46 from P07 consumes).
   - Tests: pack install adds N sticker components; informal pack triggers warning; brand lint flags off-brand sticker insertion unless whitelisted.
   - **DoD:** "Insert → Stickers" panel groups packs by theme; each sticker is a recolorable component.

### 4.7 WS-COM-7 — MCP tool surface and agent-aware enforcement

**Tasks:**

1. **MCP tools for registry + marketplace.**
   - Files: `services/registry/src/mcp/{tools,handlers}.ts`, `packages/mcp-tools/src/components.ts`.
   - Tools: `list_components`, `describe_component`, `install_component`, `uninstall_component`, `search_marketplace`, `get_listing`, `purchase_listing`, `pin_component_version`, `get_component_props_schema`, `apply_template`.
   - Tests: tool schemas validate; MCP errors map to documented codes (`ERR_BRAND_LOCK`, `ERR_LICENSE_MISSING`, `ERR_PIN_UNAVAILABLE`); dry-run flag returns diff without mutation.
   - **DoD:** an MCP test agent can install, describe, and apply a component against a sealed test workspace.

2. **Agent audit trail.**
   - Files: `services/registry/src/audit/agent.ts`, `apps/canvas/src/versionHistory/agentEntries.ts`.
   - Every registry write through MCP carries `actor_kind = 'agent'` and the agent identifier; rendered in version history alongside human edits.
   - Tests: agent-only edits tagged distinctly; combined human + agent edits replayable.
   - **DoD:** `#227` acceptance criteria met (visible separation in version history).

---

## 5. Architecture & Data

### 5.1 Service / module layout

```text
+----------------------+        +----------------------------+
| Editor / MCP / CLI   | <----> | registry-service           |
| (HTTP + WebSocket)   |        | (modular monolith at v1)   |
+----------------------+        +-------------+--------------+
                                                  |
        +-----------------------+----------------+----------------+----------------------+
        |                       |                |                |                      |
+--------v------+       +--------v------+  +------v------+  +------v------+       +------v------+
| Postgres      |       | Object Store  |  | OpenSearch  |  | CDN signer  |       | Audit / OTel |
| (catalog,     |       | (S3-compatible|  | (search,    |  | (signed URLs|       | log/metric   |
|  versions,    |       |  content-     |  |  trigram +  |  |  5-min TTL) |       | sinks        |
|  installs,    |       |  addressed)   |  |  perceptual)|  |             |       |              |
|  ledger)      |       |               |  |             |  |             |       |              |
+--------------+       +---------------+  +--------------+  +-------------+       +--------------+
```

Sub-modules within `registry-service` (modular monolith boundary per §4.2 of `/docs/04-system-architecture.md`): `catalog`, `bundles`, `props`, `sync`, `marketplace`, `moderation`, `analytics`, `templates`, `locks`, `icons`, `animations`, `stickerPacks`, `license`, `mcp`, `audit`.

### 5.2 New tables

All tables use `id uuid primary key default gen_random_uuid()` and `created_at/updated_at timestamptz default now()` unless otherwise noted. Definitions match §5 of `/docs/components-templates.md`:

- `component` (with `props_schema jsonb`, `package_hash`, `signature`, `signing_key_id`, `search_tsv` tsvector, `deprecation jsonb`, `unique (catalog_id, version)`).
- `component_variant` (denormalized for marketplace search filtering).
- `smart_component_prop` (per-prop JSON Schema fragment + control hint).
- `user_library`, `team_library`, `team_library_event` (append-only sync log).
- `marketplace_listing`, `marketplace_review`.
- `license_grant` (signed_token column stores the JWT).
- `revenue_share_event` (append-only ledger; **payout execution is P19**).
- `template`, `section_template`, `sticker_pack`, `brand_lock_region`.

### 5.3 New migrations

`migrations/2026_07_p06_components_templates.sql` (and per-step files thereafter). Migrations:

1. `001_create_component.sql` — `component`, `component_variant`, `smart_component_prop`.
2. `002_create_libraries.sql` — `user_library`, `team_library`, `team_library_event`, indexes.
3. `003_create_marketplace.sql` — `marketplace_listing`, `marketplace_review`, `license_grant`.
4. `004_create_revenue_share.sql` — `revenue_share_event`, indexes on `(seller_id, period_month, payout_status)`.
5. `005_create_templates.sql` — `template`, `section_template`, `sticker_pack`, `brand_lock_region`.
6. `006_seed_icon_index.sql` — initial 100 k icon catalog (Phosphor, Lucide, Tabler, Iconoir); a worker rebuilds the perceptual-hash index post-seed.

### 5.4 Contracts added (versioned under `/contracts`)

- `contracts/proto/domio/v1/component_registry.proto` — install/uninstall, search, describe.
- `contracts/proto/domio/v1/marketplace.proto` — listing CRUD, review submit, purchase.
- `contracts/proto/domio/v1/license.proto` — verify license token, list grants.
- `contracts/proto/domio/v1/library_sync.proto` — library event fetch/apply.
- `contracts/proto/domio/v1/templates.proto` — install template, place guided fill, list placeholders.
- `contracts/proto/domio/v1/locks.proto` — brand-lock region CRUD, lock-bypass request.
- `contracts/proto/domio/v1/mcp_components.proto` — MCP tool request/response envelopes (feature 222).
- `contracts/schema/component-package-v1.schema.json`, `contracts/schema/marketplace-listing-v1.schema.json`.

### 5.5 Cross-references to master docs

- **/docs/04-system-architecture.md** — modular monolith guidance, registry-service's place alongside `editor-canvas`, `data-gateway`, `export-pipeline`, `presence-service`, `mcp-server`.
- **/docs/05-data-database-design.md** — JSONB conventions, audit table conventions, content-hash + semver unique constraints.
- **/docs/06-technology-stack.md** — Postgres + S3-compatible object store, OpenSearch, Rust/Node split for the prop engine.
- **/docs/components-templates.md** — full design, data model, and security details this phase implements.

---

## 6. Verification matrix

| Feature | Test | Expected result | Owner |
|---:|---|---|---|
| 23 | Browse "Insert → Components," filter category Card, insert a stat-card | Catalog returns ≥ 10 k components; insert produces a live, themed instance within 1 s | Frontend lead |
| 24 | Switch a stat-card variant from `light` to `dark` | Render updates in < 100 ms p95; no other instances affected; one CRDT op emitted | Frontend lead |
| 25 | Edit the KPI value on a stat-card via the Props panel; bind a prop to a Sheets source | Prop field shows a binding chip; value updates live; canvas re-renders within one frame; binding survives a component version bump | Frontend lead + Data lead (P08 unblocks binder) |
| 26 | Select 4 elements (icon + number + label + background) → "Create component" | Inference dialog proposes 3 props (icon, value, label); user accepts; new component in My library; second deck inserts an instance with overrides preserved | Frontend lead |
| 27 | Workspace admin publishes a component v1.1.0; two subscribers' decks are open | Within 60 s, both decks show "Update available" badge; bulk update applied; offline replay is deterministic | Registry-service lead |
| 28 | Creator publishes a free listing; another user installs it | Listing visible in search within 60 s; install completes within 1.5 s for ≤ 5 MB; license_grant row + revenue_share_event row written; audit row created | Marketplace lead |
| 28 | Paid listing purchased | Stripe test charge succeeds; license JWT issued; render verifies token online + offline (30-day grace) | Marketplace lead |
| 29 | Open Insert → Marketplace → Templates → Pitch decks | 14 results render; faceted filters work; preview video/poster load; "Use this template" copies to workspace | Designer/UX |
| 30 | Install a 12-slide full deck template; run "Guided fill-in" | Placeholders highlighted in narrative order; binding a placeholder to a data source converts it to a `dataBinding` prop | Frontend lead |
| 31 | Insert a "Team" section template into a deck with conflicting theme | Section installs with explicit overrides; user sees a diff dialog; accepting applies overrides | Frontend lead |
| 32 | Search icons "trend up arrow" | Results across ≥ 4 styles; perceptual-hash similarity search returns in < 600 ms p95; recolor via token persists across theme swap | Frontend lead |
| 33 | Search Unsplash for "office"; insert a photo | Asset downloads; attribution recorded in `credits[]`; license metadata persisted; offline render works for ≥ 30 days | Marketplace lead |
| 34 | Insert a Lottie animation; recolor to brand accent | Animation respects token; reduced-motion preference auto-honors; bundle size warning at > 250 KB gzipped | Frontend lead |
| 35 | Insert a sticker from an "informal-only" pack in a strict-governance workspace | Soft warning + brand lint finding on insertion | Designer/UX + Frontend lead |
| 36 | Drag a logo inside a brand-locked region | Drag rejected client-side; server returns `ERR_BRAND_LOCK` on CRDT write; audit row created with `actor_kind = 'human'` | Registry-service lead |
| 222 | MCP test agent runs `install_component` then `describe_component` against a sealed workspace | Both tools return structured JSON; agent's edits visible in version history with `actor_kind = 'agent'` | MCP/agentic lead |
| 233 | Agent emits `KPI value = 42` against a stat-card's prop schema via structured output | Prop engine validates; canvas reflects the value; identical validation in editor, server, and headless render | AI lead (forward-pointer to P12) |
| 225 | Agent token lacks `brand_lock_bypass`; agent tries to edit a locked region | API returns `ERR_BRAND_LOCK`; agent cannot bypass | Registry-service lead |
| 196 | Workspace admin opens the audit log for a deck | Every component install, update, license check, brand-lock violation is visible with trace_id | Platform lead |
| 47 (cross-cite) | Theme override exists on slide 7; user installs a component onto slide 7 | Component inherits the override correctly; per-slide overrides survive the install | Frontend lead (with P07 cross-check) |

---

## 7. Risks & open decisions

- **Bundle size sprawl.** Heavy Lottie files and high-res stock media can blow past per-deck size budgets. **Mitigation:** strict `heavy` flag + insert-time warning (NFR-COM-6); auto-transcode GIFs to MP4/WebM; per-component size caps enforced at publish.
- **Marketplace moderation quality.** Auto-flag pipelines have false-positive cost. **Mitigation:** SLA-aware human queue, A/B on the spam model quarterly, "verified buyer" badge tied to actual license grant.
- **License verification at render time can degrade performance.** Online license check on every render is too slow. **Mitigation:** 5-minute cache + 30-day offline grace + device fingerprint only for casual-sharing detection, not as a hard gate.
- **Prop schema divergence.** Two component versions with different prop shapes create instance-update edge cases. **Mitigation:** per-prop schema fragment versioning; old instances keep deprecated values with an "Update available" badge rather than silent coercion.
- **Marketplace billing/payout scope creep.** The deferred payout execution must not leak into this phase. **Mitigation:** `payout_status` enum is the contract surface; any code path that moves money is gated behind a `payout_executor_enabled` feature flag (off in P06, on in P19).
- **Brand-locked regions interacting with auto-layout (feature #7).** Locks may need to constrain auto-layout itself, not just element edits. **Mitigation:** lock scope `region` covers whole subtrees; lock applied at the scene-graph node and inherited downward; tests cover locked subtree + autolayout child insertion.
- **License compatibility for icons and stickers.** Some upstream icon libraries restrict commercial redistribution. **Mitigation:** ingestion pipeline records per-icon license; license filtering is a first-class facet in marketplace search; "commercial plan required" gate exists.
- **Currency localization (BDT/USD) at install time.** Stripe Connect is USD-denominated; bKash is BDT. **Mitigation:** every install records `currency` and `gross_cents`/`fee_cents`/`net_cents` explicitly (integer cents, no floats, per §5.7 of planning guide); FX conversion deferred to payout execution (P19).

---

## 8. Demo

A working demo proving the phase is done in the internal environment.

**Setup:**

1. Internal env seeded with a workspace containing a workspace-admin user, two designers, and one publisher role; `theme.platform.fallback` is loaded.
2. A pre-authored component package (`stat-card@2.0.0`) and a pre-authored full-deck template (`pitch-deck-v1`) are uploaded; preview poster + loop generated.
3. Strict-governance brand kit is attached; a brand-locked region exists on the template's cover slide.

**Script:**

1. **Browse and insert.** Designer opens the editor, clicks Insert → Components → Stat. Searches "KPI"; picks the canonical stat-card; drag-drops onto slide 3. The slide reflows via auto-layout.
2. **Edit via the prop panel.** Designer edits the value to `1240000`; label to `Active users (Q3)`; switches variant to `dark`; binds `value` to a Google Sheets mock source. Canvas updates within one frame. (15 s)
3. **Promote to component.** Designer selects the icon + value + label; right-click → Create component; the inference dialog proposes 3 props (icon, value, label); designer renames one, accepts; new component appears in My library with a "Just created" badge. (45 s)
4. **Team library publish/subscribe.** Designer switches to a second workspace with a publisher role; publishes the new component to the team library; the first designer (subscriber) sees an in-app toast within 60 s. (60 s)
5. **Template install.** A third user (exec) opens Insert → Marketplace → Templates → Pitch decks; installs `pitch-deck-v1`. Guided fill-in walks placeholders in narrative order; exec types company name into the first placeholder; the next placeholder highlights on the relevant slide. (60 s)
6. **Brand-locked region.** Exec tries to drag the cover-slide logo; drag is rejected with "Region brand-locked — request access from admin." Hover shows the lock glyph + admin owner + allowed-override list. (15 s)
7. **Sticker pack.** Designer inserts a sticker from an "informal-only" pack; the strict-governance workspace surfaces a soft warning and the brand lint flag is visible in the Lint panel. (15 s)
8. **Marketplace plumbing.** A creator publishes a free sticker pack; another user installs it; `marketplace_listing` status moves through `in_review → published`; a `revenue_share_event` row exists (with `payout_status='eligible'` since payout is P19). (45 s)
9. **MCP agent.** A test MCP agent runs `describe_component` against the stat-card, then `install_component`; the install completes and the version history shows the install entry with `actor_kind='agent'`. (30 s)
10. **Stock media.** Designer searches Unsplash for "office"; inserts a photo; attribution is recorded in `credits[]`. (15 s)

**Pass criteria:**

- Every step completes in the time budget.
- Telemetry: `component_installs_total{workspace_id, source}` increments for each install; `prop_panel_render_duration_seconds` p95 < 50 ms; `variant_switch_duration_seconds` p95 < 100 ms; `marketplace_search_latency_seconds` p95 < 400 ms warm.
- License audit log: every install, license verify, and brand-lock violation has a row.
- Per-slide overrides from a prior P07 theme override survive the marketplace install.

---

## 9. Definition of Done

Gates that must all be checked before the phase is considered done.

- [ ] All §4 workstream tasks merged to `main` with green CI (unit, integration, contract, lint, type-check).
- [ ] All §5 schemas and Proto contracts versioned under `/contracts`, each with a CHANGELOG entry; OpenAPI specs regenerated and checked in.
- [ ] All migrations under `migrations/2026_07_p06_*.sql` applied to staging; roll-forward + roll-back tested.
- [ ] Unit test coverage ≥ 80 % line on `services/registry` (`catalog`, `props`, `license`, `templates`, `locks` modules); property tests on the prop engine and resolver.
- [ ] Integration tests pass: install/uninstall round-trip with hash verification; multi-subscriber library sync; license verify online + offline.
- [ ] End-to-end Playwright suite passes: the full demo script.
- [ ] Performance budgets verified in CI nightly run: prop panel 50 ms p95, variant switch 100 ms p95, install ≤ 1.5 s p95 for ≤ 5 MB, marketplace search ≤ 400 ms p95 warm.
- [ ] Security tests pass: tampered package rejected; Lottie script features stripped; forged license token rejected; SSRF blocked on extraction fetcher; SVG sanitization verified.
- [ ] Telemetry: histograms + counters in §9 of `/docs/components-templates.md` are emitting to the OTel collector in staging; alerts wired in Grafana (`install_error_rate`, `marketplace_search_latency`, `license_verification_failures_total`, `brand_lock_violation_total`).
- [ ] MCP tools implemented and documented; an MCP test agent exercises the full install/describe/pin/apply surface in CI.
- [ ] Marketplace plumbing emits `revenue_share_event` rows; **payout execution remains off** (`payout_executor_enabled = false`).
- [ ] Brand-lock enforcement: client + server both reject; admin lock-bypass audited; MCP agent blocked with `ERR_BRAND_LOCK`.
- [ ] Cross-section ties verified: P07 (theme) consumes `marketplace_listing` schema; P12/P13 forward-compatibility for prop schemas verified by the `get_component_props_schema` MCP tool round-trip.
- [ ] Localization: prop panel labels and marketplace surfaces available in en + bn + es + fr + de + ja + zh-CN (NFR-COM-13).
- [ ] Accessibility: axe-core run on the prop panel and the Insert → Components panel returns zero AA violations.
- [ ] Documentation: this phase doc + the §10 cross-section ties section in `/docs/components-templates.md` reviewed by Stream A leads; ADRs for prop schema choice (JSON Schema draft 2020-12) and content-addressed bundle store are checked into `/docs/adr/`.
- [ ] Demo passed in internal environment per §8.

_Phase 06 closes when the DoD checklist is fully checked. P07 (theming), P12 (AI), P13 (agentic), P14 (sharing), P15 (presenter), P17 (analytics), and P19 (marketplace billing/payout) all become unblocked at that point._