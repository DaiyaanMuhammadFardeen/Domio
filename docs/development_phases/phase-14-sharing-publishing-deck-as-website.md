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

# Phase 14 — Sharing, Publishing & Deck-as-Website

**Phase:** 14
**Name:** Sharing, publishing & deck-as-website
**Owner:** Stream E — Live Experience lead; sub-owners per workstream (Share Service, Access Policy, Watermark, Custom Domain, Embed, Narration, Export, SEO/Social, Print, Propagation)
**Critical-path:** Yes (one leg of the critical path: P05 → P14 → P20 → P21 → P22). Sharing is the smallest "design partner deliverable" gate.
**Parallel stream tag:** Stream E — Live Experience (sibling to P15 presenter experience and P16 audience participation)

**Intent:** Turn every Domio deck into a first-class addressable surface on the public web. Each shared deck is a stable responsive URL that renders as either a presenter-style slide view or a vertical scroll-mode scrollytelling page; access is governed by a single policy engine (`public | password | domain_restricted | sso | request_access`) with optional expiry, watermarking, and per-slide visibility rules per link; white-label themes and custom domains (with auto-issued TLS) make the renderer brand-portable; the same engine ships video (MP4), PDF and PPTX exports with graceful degradation of interactivity, narrated autoplay for async viewing, SEO snapshots and social preview cards for discoverability, print-optimized handout layouts for paper, and an `deck.updated` event bus that propagates fixes to every live shared link without re-sending URLs. The phase closes the loop from "design" (Phase 03) and "author" (Phases 06–13) to "deliver," and is the bottleneck phase that revenue, compliance, and CDN converge on.

---

## 1. Goals

- Every deck in any workspace is reachable as a stable responsive URL `/d/{short_id}` that renders on mobile (≥360 px), tablet (≥768 px) and desktop (≥1280 px) with Lighthouse mobile ≥ 90 and LCP ≤ 2.0 s on a Moto G4 / Slow 4G profile, with no app install, plugin or login by default. (#155)
- A single Access Policy Engine evaluates every request in ≤50 ms p95 (Redis-backed), supports five access levels (`public`, `password`, `domain_restricted`, `sso`, `request_access`), enforces expiry/`max_views`, and emits immutable audit entries — and the same engine gates the embedded and white-label views. (#157, #158)
- Per-link slide-level visibility rules (`visible | hidden | watermarked_only`) ship **zero footprint** to the viewer's browser for hidden slides, with an editor-side "this slide is hidden from link X" badge to prevent overshare. (#159)
- Custom domains (`deck.yourcompany.com`) verify via DNS TXT or HTTP-file challenge, issue TLS automatically via ACME DNS-01 with renewal at 30 days before expiry, and apply a sanitized white-label theme that cannot break structural layout. (#160)
- Video (MP4), PDF and PPTX exports complete at the documented budgets, flatten interactivity with explicit `degraded_slides` lists, include a snapshot timestamp and an optional QR-to-live link, and the video pipeline reuses the Phase 09 export worker for animations and the Phase 11 pipeline for 3D software-WebGL fallback. (#163, #164)
- Narration runners stream audio via HLS, hold ±50 ms time-sync to slide cues, respect `prefers-reduced-motion` and `prefers-reduced-data`, and pause gracefully when the viewer interacts (click hotspot, toggle scenario) without losing sync. (#162)
- Public decks render server-side HTML for crawlers with JSON-LD `PresentationDigitalDocument`, per-slide `<article>` markup, auto-generated `sitemap.xml`, and per-deck + per-slide OG cards at 1200×630 that invalidate within 5 s of a `deck.updated` event. (#165, #166)
- Print handout layouts (1/2/3/4/6/9-up) compose via CSS `@page` rules with a per-page QR-to-live-link, respect page size (A4/Letter/Custom) and color profile (RGB/CMYK). (#167)
- An `deck.updated` event bus propagates edits to live shared links within ≤5 s end-to-end (debounced 2 s on the writer side, ≤5 s CDN invalidation window, ≤50 ms renderer rehydrate on receipt), and exports always remain pinned to the version they were triggered against. (#168)

---

## 2. Scope

### In scope (feature numbers, per `feature-list.md`)

| Feature | Description                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------ |
| #155    | Every deck is a responsive web page with its own URL (mobile/tablet/desktop, Lighthouse ≥ 90)    |
| #156    | Scroll mode — scrollytelling async reading with sticky choreography and `#s=4&t=12s` deep-link   |
| #157    | Access levels: `public`, `password`, `domain_restricted`, `sso`, `request_access`                |
| #158    | Expiring links (`expires_at` / `max_views`) and per-viewer watermarking (visible + forensic)     |
| #159    | Per-link content control — slide-level visibility rules per link                                 |
| #160    | Custom domains (CNAME + ACME DNS-01) and white-label viewer (theme tokens)                       |
| #161    | Embeds (Notion, Confluence, iframe) with live interactivity preserved and `postMessage` channel  |
| #162    | Narrated autoplay (TTS voiceover synced to slides, interactive pause/resume)                     |
| #163    | Video export (MP4 with animations and narration; 720p/1080p/4K)                                  |
| #164    | PDF and PPTX export with graceful degradation of interactivity                                   |
| #165    | SEO-ready public decks (`PresentationDigitalDocument`, `sitemap.xml`, per-slide semantic markup) |
| #166    | Social preview cards (1200×630 OG/Twitter/LinkedIn/Slack) per deck and per slide                 |
| #167    | Print-optimized handout layouts (1/2/3/4/6/9-up with optional handwritten-note lines)            |
| #168    | Deck update propagation — same URL, `deck.updated` bus, ≤5 s end-to-end                          |

### Out of scope (deferred to other phases or never)

- **Widevine / PlayReady DRM on video exports** — v1 uses forensic watermark as the deterrent; full DRM is a v2 feature (per `sharing-publishing.md` §11).
- **Built-in Notion OAuth app** — v1 ships embed snippet + bookmarklet; OAuth Notion app is v2.
- **Voice cloning for AI narration** — v1 uses author-recorded voice or stock TTS; cloning requires explicit consent flow (v2).
- **On-prem self-served ACME** — managed by Domio in v1; on-prem ACME ships with the local-first SDK (#232).
- **MCP share / export tools** (`create_share_link`, `queue_export`, `apply_watermark`) — the contracts emit here, but full MCP tool wiring is Phase 13 (tool surface) plus Phase 22 hardening; the listing in `sharing-publishing.md` §6.6 is the contract source of truth.
- **Native PowerPoint plug-in for one-way sync** — out; export covers the round-trip.
- **Per-viewer asset variant caching across workspaces** — variant cache is LRU 30 d within workspace only; cross-workspace variant reuse is a polish task.
- **Public decks with deep personalization per visitor** — out; visitor-claimed customization is a P21 frontier feature.
- **AI-generated deck summaries for SEO description** — deferred to P22; v1 uses author-supplied metadata.
- **Bangla-script typography optimizations in handouts** — default font is Latin; bn-BD glyph fallback is P22 polish.

---

## 3. Dependencies

### Upstream (must be complete before P14 starts)

- **P00 — Repo, contracts, dev environment.** Contracts live under `/contracts`; OpenAPI spec is the source of truth; CI runs the contract suite.
- **P01 — Observability, CI/CD, infra baseline.** OpenTelemetry SDK, Prometheus exporters, CDN edge modules, ACME infrastructure, secrets manager (for cert private keys and watermark signing keys) and `puku-bot` rate-limit service must be live.
- **P02 — Deck schema & scene-graph foundation.** `deck.schema.json`, `scene-graph.schema.json`, `element_role` and `version_id` semantics are the source for renderer hydration.
- **P03 — Canvas editor MVP.** Authoring produces `version_id` per save; share dialog lives inside the editor chrome.
- **P04 — CRDT & presence.** Presence drives the "live collaborator" badge in shared view (read-only); a co-edited deck can't be shared in stale state (Phase 14 surfaces `version_id` only after CRDT convergence).
- **P05 — Persistence, versioning, branches.** `share_link.deck_id` references a versioned deck; `pinned_version_id` requires the versioning model; branches produce `version_id` distinct from main.
- **P06 — Components & templates.** Smart components expose typed props (function-calling-ready per #233), enabling watermark forensics on component-rendered subtrees.
- **P07 — Theming & brand.** White-label tokens reuse the Phase 07 design-token schema (CSS custom properties + JSON allowlist).
- **P08 — Live data & charts.** `data source access control` (#64) is the same proxy pattern used by the watermark proxy; `on_data_change` triggers (P09) live inside the renderer.
- **P09 — Animation & transition system.** Web-shared deck mounts the same `TimelineEngine`; `prefers-reduced-motion` is shared; `POST /v1/decks/{id}/exports` is wrapped by `POST /v1/exports` here.
- **P11 — 3D, motion & rich media.** 3D models hydrate in scroll mode via click-to-load; video export's software-WebGL fallback (SwiftShader/angle) is owned by P11.

### Cross-stream (parallel, must coexist)

- **P12 — AI copilot foundation.** Narration tracks can be AI-generated from notes (#116); caption sidecars reuse P12 STT output.
- **P13 — Agentic & MCP.** `sharing-publishing.md` §6.6 lists the MCP tools; P13 wires the runtime tool surface and audits.
- **P20 — Security & enterprise (continuous).** Per-region residency, SSO gating on the share dialog, DLP before publish, and audit-log retention are P20 hooks that P14 emits into. P14 ships the emissions; P20 ships the gating.

### Downstream (this phase unblocks)

- **P15 — Presenter experience.** Presenter recap (#141) exports via the print/PDF pipeline; presenter view (#126) consumes `deck.updated` for live rehydration; presenter view's PiP and replay use the same `version_id`.
- **P16 — Audience participation.** Per-session handout URLs (#151) are minted via the share-link API; audience view embeds use the same embed proxy.
- **P17 — Analytics & engagement intelligence.** Public-deck traffic, scroll attention heatmaps (#171), sales-mode notifications (#172) and funnel view (#177) all consume the `share_link` + view-event surface P14 emits.
- **P18 — Collaboration & workflow.** Approval workflow before share (#180), content expiry (#187), and review/approval gating all live on top of the share API.
- **P20 — Security & enterprise.** DLP on outbound links, residency-aware custom-domain provisioning, SSO gating, audit retention, and watermark forensic chain-of-custody are P20 policies against P14 surfaces.
- **P21 — Novel & frontier.** Living documents (#206), presentation state timeline (#205), deck inheritance trees (#212) and cross-deck knowledge graph (#219) consume `version_id`, `share_link`, and the event bus.
- **P22 — Polish, scale, GA.** PDF/UA compliance uplift, multi-CAA strategy for LE bulk issuance, SCORM 1.2 packages for handouts, and the 25k-recipient fan-out ceiling are P22.

---

## 4. Workstreams

The phase splits into ten ordered workstreams. W1–W3 are foundational and must land first; W4–W8 depend on W1 (the share-link data plane + policy engine). W9 depends on W1 + W6. W10 depends on every other workstream.

### W1 — Share-link data plane & token signing

**Sub-owner:** Share Service lead
**Goal:** Ship the core CRUD on `share_link` and `link_policy`, the signed-token mint/verify path, and the rotation/extend/revoke endpoints.

**Tasks.**

1. Create Postgres tables `share_link`, `link_policy`, `link_visibility_rule`, `watermark_profile`, `embed_config`, `seo_metadata` (DDL per `sharing-publishing.md` §5, `db/migrations/2026Q4/p14_shares.sql`).
2. Implement `services/share-api` REST endpoints per `sharing-publishing.md` §6.1–§6.2 (`POST /v1/shares`, `PATCH /v1/shares/{link_id}`, `GET /v1/shares/{link_id}`, `DELETE /v1/shares/{link_id}`, `POST /v1/shares/{link_id}/rotate-token`, `POST /v1/shares/{link_id}/extend-expiry`, `GET /v1/shares/{link_id}/policy`, `PUT /v1/shares/{link_id}/policy`).
3. Implement `packages/signed-link-token` — HMAC-SHA256 over `{short_id, expires_at, viewer_claims, nonce}` keyed by a per-workspace secret (rotated quarterly); constant-time comparison server-side; replay protection via Redis nonce store (TTL = token TTL).
4. Implement short-id generator (8 char base32, Crockford alphabet) with checksum; pre-generate pools for hot paths.
5. Implement audit-log emission on every privileged action (link create/update/delete/policy change/rotate/extend/revoke) with `actor_id`, `link_id`, `ts`, `before`, `after`.
6. Wire `services/share-api` into the editor's Share modal (`apps/editor/src/components/share/ShareDialog.tsx`).
7. Add OpenAPI spec at `contracts/openapi/v1/shares.yaml`; generate `@domio/contracts/types/share/*` TypeScript types.
   **Files / packages touched:** `db/migrations/2026Q4/p14_shares.sql`, `services/share-api/src/{routes,handlers,policy}.ts`, `packages/signed-link-token/src/{mint,verify,nonce}.ts`, `apps/editor/src/components/share/{ShareDialog,LinkPolicyPanel,VisibilityRules}.tsx`, `contracts/openapi/v1/shares.yaml`.
   **Contracts produced:** `shares.yaml`, `link_policy.v1.json`, `link_visibility_rule.v1.json`, `watermark_profile.v1.json`.
   **Tests written:**

- Migration test: every DDL block applies and reverts cleanly on a fresh DB; RLS policies enforce tenant scope (`workspace_id`).
- Unit: token mint/verify round-trip; constant-time comparison property-based test; nonce replay rejected.
- Unit: `rotate-token` invalidates old token within 1 s of `rotate` call; concurrent rotate calls produce exactly one new token.
- Integration: full lifecycle (`POST → PATCH → PUT policy → extend-expiry → rotate → DELETE`) yields expected audit-log entries (12 total).
  **DoD:** Endpoints exposed at `/v1/shares` in staging; tokens signed; OpenAPI validated; audit log populated.

### W2 — Access Policy Engine & `web-viewer` shell

**Sub-owner:** Access Policy lead
**Goal:** Ship the single decision point that evaluates every request as `link_status==active && policy.allows(claims) && expiry>now && quota_within_budget && geo_allowlist(if set)`. Also ship the renderer shell that hydrates a minimal frame, then lazy-loads per-slide bundles.

**Tasks.**

1. Implement `services/access-policy` as an edge-deployable WASM module + Go control plane, evaluated ≤50 ms p95 with Redis hot cache; deny-by-default; decision is logged with structured fields (`link_id`, `viewer_hash`, `decision`, `reason`, `latency_ms`).
2. Implement `apps/web-viewer` — single-page app with mobile-first responsive layout, per-slide code-splitting, chunk preloader, and a minimal chrome (no nav, no export menu by default).
3. Implement SSR snapshot generator (`services/seo-snapshot`) for public links; crawlers receive a server-rendered HTML with semantic markup and JSON-LD.
4. Implement deep-link support (`#s=4&t=12s` hash; `?embed=1` flag; `?controls=1` opt-in).
5. Wire `services/access-policy` into the CDN edge (Cloudflare Workers / Fastly Compute@Edge) — decision cached at the edge for ≤60 s per `(short_id, viewer_claims_class)`.
6. Add Prometheus counters/histograms: `policy_decision_total{decision,reason}`, `policy_decision_duration_seconds`, `viewer_html_ttfb_seconds`.
   **Files / packages touched:** `services/access-policy/src/{engine,decision,geo,quota}.{rs,go}`, `apps/web-viewer/src/{App,Router,SlideFrame,CodeSplit}.tsx`, `services/seo-snapshot/src/{render,emit,sitemap}.ts`, `infra/terraform/cdn-edge/access-policy.tf`.
   **Contracts produced:** `access_policy.v1.json` (decision shape), `viewer_url.v1.json` (canonical URL grammar).
   **Tests written:**

- Unit: every (level × claim × state) tuple reaches the documented decision (`tests/fixtures/policy_decisions.json`).
- Unit: deny-by-default — unknown level returns `deny`.
- Property-based: a fully random claim against a fixed link yields `deny` at p ≥ 0.99 with 1000 iterations.
- Performance: hot-path decision ≤ 50 ms p95 against a 50k-entry Redis cache.
- E2E: public link in 3 viewports (360/768/1280 px) hydrates without horizontal scroll; Lighthouse mobile ≥ 90 on the fixture deck.
  **DoD:** All five access levels work end-to-end in staging; SSR snapshot exists for every public link; decision is logged.

### W3 — Per-link visibility rules, expiry, watermark (visible + forensic)

**Sub-owner:** Watermark / Visibility lead
**Goal:** Author and author-preview slide-level visibility per link; deliver visible + forensic watermark with per-viewer asset variants; enforce expiry and `max_views`.

**Tasks.**

1. Implement `services/watermark` — visible overlay (server-rendered HTML, not CSS), forensic steganography (LSB on images, DCT-mod on video frames), per-viewer asset variant generation, watermark profile CRUD.
2. Implement `link_visibility_rule` enforcement in `services/access-policy` — "hidden" ships **zero footprint** (assert in test), "watermarked_only" ships with the watermark profile front-and-center.
3. Implement expiry/`max_views` enforcement in the policy engine; expired links return 410 Gone with a 30-day cached snapshot, then hard-deleted.
4. Implement per-viewer asset variant cache (Redis pointer + S3 blob); LRU 30 d retention; per-workspace secret rotated quarterly.
5. Ship "this slide is hidden from link X" badge in editor (`apps/editor/src/components/slides/HiddenBadge.tsx`).
6. Ship "Preview as recipient" in the share dialog — sandboxed tab rendering the exact recipient experience (no analytics trace).
7. Add forensic-verification test harness (`tests/forensic/decode.ts`) — given a viewer-A render and viewer-B render of the same fixture, both signals decode to distinct claims.
   **Files / packages touched:** `services/watermark/src/{visible,steg,dct,variant,profile}.ts`, `services/access-policy/src/handlers/visibility.ts`, `apps/editor/src/components/slides/HiddenBadge.tsx`, `apps/editor/src/components/share/PreviewAsRecipient.tsx`, `tests/forensic/{decode,fixtures}.ts`.
   **Contracts produced:** `watermark_apply.v1.yaml` (`POST /v1/watermarks/apply`, `GET /v1/watermarks/jobs/{job_id}`), `watermark_profile.v1.yaml`.
   **Tests written:**

- Unit: hidden slides are absent from the response payload — assert HTML/JS bundle byte-count and grep for known slide text.
- Unit: forensic decode succeeds for both viewer-A and viewer-B variants; decoding yields distinct claims.
- Performance: visible overlay adds ≤ 8 ms to TTFB; forensic variant generation ≤ 250 ms p95 per asset.
- Security: a screenshot of a watermarked slide passes the decode harness; cropping to the central 80% viewport does not destroy the signal.
  **DoD:** All three watermark modes work; expiry returns 410 Gone with snapshot; hidden-slides zero-footprint test green.

### W4 — Custom domains + TLS automation + white-label theme pipeline

**Sub-owner:** Custom Domain lead
**Goal:** Ship `deck.yourcompany.com` with verified DNS, ACME DNS-01 TLS, auto-renewal at 30 d before expiry, and a sanitized white-label theme that can rebrand the viewer without breaking structural layout.

**Tasks.**

1. Implement `services/custom-domain` — DNS verification (TXT `_domio-verify` or HTTP `/.well-known/domio-verify/{token}`), ACME DNS-01 driver (Cloudflare / Route53 / manual), per-domain cert issuance, renewal at 30 d, and a re-issuance path on private-key compromise.
2. Implement `packages/white-label-tokens` — token allowlist schema (CSS custom properties only; no `expression()`, no `url()`, no `@import`, no `behavior:`); JSON validator + sanitizer.
3. Implement `services/white-label` — theme bundling per link, injection at viewer `<head>`, default-theme baseline preserved.
4. Wire multi-domain to single workspace with per-domain theme override.
5. Wire "preview live in iframe sandbox" into the share dialog (`apps/editor/src/components/share/WhiteLabelPreview.tsx`).
6. Implement cert-manager `Certificate` CRD per domain; certs stored encrypted at rest (Vault transit); private keys never leave the secret store.
   **Files / packages touched:** `services/custom-domain/src/{verify,acme,renew,monitor}.ts`, `packages/white-label-tokens/src/{allowlist,sanitize,validate}.ts`, `services/white-label/src/{bundle,inject}.ts`, `infra/terraform/acme/`, `apps/editor/src/components/share/WhiteLabelPreview.tsx`.
   **Contracts produced:** `custom_domain.v1.yaml`, `white_label_theme.v1.yaml`.
   **Tests written:**

- Unit: token allowlist rejects `expression(alert(1))`, `url(javascript:...)`, `@import`, `behavior:`, and arbitrary `@keyframes`.
- Unit: default theme baseline is preserved even when a white-label theme injects overrides.
- E2E: full lifecycle — add domain → verify → issue cert → TLS handshake under new domain → renderer loads under that domain.
- Negative: ACME rate-limit hit triggers exponential backoff with a dashboard banner; misconfigured DNS surfaces the exact missing record.
  **DoD:** Custom domain live in staging on a real domain; cert renewal observed in a 60-day simulation; theme cannot break layout.

### W5 — Embed proxy + `postMessage` channel + Notion/Confluence helpers

**Sub-owner:** Embed lead
**Goal:** Ship the embed iframe with strict CSP, sandbox, allowed-parents enforcement, bi-directional `postMessage`, and the Notion/Confluence helpers.

**Tasks.**

1. Implement `services/embed-proxy` — edge-routed embed rendering with strict CSP (`frame-ancestors`, `default-src 'self' cdn.domio.io; script-src 'self' 'nonce-...'; img-src 'self' data: https:; connect-src 'self' api.domio.io`), `Permissions-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`.
2. Implement `postMessage` protocol v1.0 — events (`slide:change`, `interactive:complete`), commands (`slide:goto`, `scenario:set`); version stamped on every message; origin-pinned.
3. Ship the embed code endpoint `GET /v1/shares/{link_id}/embed-code` returning iframe src, recommended size, sandbox, allowed-parents check, and protocol version.
4. Ship the Notion-specific deep-link helper and the iframe-strip bookmarklet for sites that strip `<iframe>`.
5. Wire `embed_config` table to `link_policy`; respect `show_chrome`, `show_export`, `show_watermark`, `post_message_enabled` flags.
   **Files / packages touched:** `services/embed-proxy/src/{render,csp,sandbox,postmessage}.ts`, `apps/web-viewer/src/embed/{Bootstrap,PostMessageClient}.ts`, `apps/editor/src/components/share/EmbedSnippet.tsx`, `packages/embed-protocol/src/v1.ts`.
   **Contracts produced:** `embed_config.v1.yaml`, `post_message_protocol.v1.json`.
   **Tests written:**

- Unit: CSP synthesis correctly emits `frame-ancestors` from `allowed_parents`.
- Unit: `postMessage` rejects messages from origins not in `allowed_parents`.
- E2E: embed on an allowed parent succeeds with full interactivity; embed on a denied parent returns 403 with no leakage.
- E2E: Notion iframe-strip scenario uses bookmarklet path and reaches the renderer.
  **DoD:** Embed in Notion / Confluence / WordPress succeeds in staging; denied domain returns 403; `postMessage` protocol is versioned.

### W6 — Narration runner + AI narration ingestion

**Sub-owner:** Narration lead
**Goal:** Ship the narrated auto-play experience: per-slide audio (recorded, uploaded, or AI-generated), HLS streaming, cue-anchored state machine, chapter strip, captions sidecar, and interactive-pause-and-resume with ±50 ms sync.

**Tasks.**

1. Implement `apps/web-viewer/src/narration/NarrationRunner.ts` — state machine `playing | paused | scrubbing | interactive-pause | ended`; cue points drive slide advance; scrub snaps to nearest cue; 200 ms resume guard.
2. Implement HLS audio stream packaging in `services/narration` (per-cue chunks, low-bitrate for `prefers-reduced-data`).
3. Implement cue ingestion from author-uploaded single track or AI-generated per-slide from notes (#116, owned by P12).
4. Implement optional chapter strip (`apps/web-viewer/src/components/NarrationChapters.tsx`) with WebVTT sidecar.
5. Honor `prefers-reduced-motion`, `prefers-reduced-data`, and muted-tab policies (continue audio; show muted banner).
6. Add buffer-underrun handling — switch to "narrated but paused" with re-sync on resume.
   **Files / packages touched:** `services/narration/src/{track,cues,package,hls}.ts`, `apps/web-viewer/src/narration/{Runner,BufferGuard,ChapterStrip}.ts`, `db/migrations/2026Q4/p14_narration.sql`, `apps/editor/src/components/narration/{Recorder,Uploader,TimelineCueEditor}.tsx`.
   **Contracts produced:** `narration_track.v1.yaml`, `narration_cue.v1.json`.
   **Tests written:**

- Unit: scrub-snap within 50 ms of cue time; 200 ms resume guard prevents audio glitching.
- Performance: 5 s buffer underrun → graceful "paused" mode within 200 ms.
- E2E: hotspot click during narration pauses 200 ms then resumes; sync restored to ±50 ms.
- Localization: caption sidecar renders Bangla (bn-BD) and Arabic (RTL reserved).
  **DoD:** Narrated deck plays, scrubs, and pauses-resumes in staging; sync within ±50 ms; muted-tab banner shown.

### W7 — Video export (MP4) + headless renderer pipeline

**Sub-owner:** Video Export lead
**Goal:** Ship `POST /v1/exports` with `{format: mp4, ...}` producing H.264 + AAC at 720p/1080p/4K, two-pass for narration, software-WebGL fallback for 3D, priority lanes, and progress observable via SSE/webhook.

**Tasks.**

1. Implement `workers/export-render-mp4` — Chromium-based headless renderer, parallelized per slide, frame capture via `MediaRecorder` or ffmpeg pipeline.
2. Implement two-pass muxer (`services/export-pipeline/src/two-pass.ts`) — first pass produces dry-run timeline, second pass muxes audio with frame-accurate sync.
3. Implement software-WebGL fallback (SwiftShader/angle) for 3D slides; `degraded_slides` records the slide id + reason.
4. Implement priority lanes (`fast`/`standard`/`bulk`) with weighted fair scheduling; auto-scale worker pool on queue depth.
5. Implement artifact storage in S3-compatible store with 7-day signed URL.
6. Implement job submission UI (`apps/editor/src/components/share/ExportMotionDialog.tsx`) with format/resolution/FPS/narration toggles and live ETA.
   **Files / packages touched:** `workers/export-render-mp4/src/{render,encode,mux}.ts`, `services/export-pipeline/src/{job,two-pass,storage}.ts`, `db/migrations/2026Q4/p14_export_jobs.sql`, `apps/editor/src/components/share/{ExportMotionDialog,ExportHistory}.tsx`.
   **Contracts produced:** `export_job.v1.yaml` (reuses `POST /v1/exports` from `sharing-publishing.md` §6.4).
   **Tests written:**

- Performance: 50-slide deck MP4 1080p with animations ≤ 25 min wall; 4K ≤ 60 min.
- Performance: 10 s / 720 p MP4 ≤ 30 s wall.
- Determinism: two runs of the same deck are byte-identical for the first 600 frames (CI gate).
- Negative: 3D-heavy deck falls back to software-WebGL within 3× render time; `degraded_slides` is populated correctly.
- Negative: SSRF guard rejects RFC1918 / loopback URLs in embedded iframes (#81, #62).
  **DoD:** Export budgets met; `degraded_slides` populated; priority lanes observable.

### W8 — PDF and PPTX export with graceful degradation

**Sub-owner:** PDF/PPTX Export lead
**Goal:** Ship `POST /v1/exports` with `{format: pdf|pptx, ...}` producing vector-first PDF with image rasterization at 2× DPI, and OOXML-shaped PPTX with animated slide-build degradation.

**Tasks.**

1. Implement PDF pipeline (`workers/export-render-pdf`) — vector-first via SVG-native deck, image fallback at 2× DPI, PDF/UA tagged for accessibility.
2. Implement PPTX pipeline (`workers/export-render-pptx`) — OOXML shapes for vector, high-DPI PNGs for raster, animations converted to slide-build order, compatibility downgrade pass for older PowerPoint.
3. Implement graceful degradation — interactive elements (forms, calculators, hotspots, scenarios) become static snapshots with QR-to-live link printed bottom-right; live-data charts flatten with snapshot timestamp footer.
4. Implement handout companion (`#167`) — see W9.
5. Implement plan-limit guard — 4K-cap plans rejected with `plan_limit_exceeded` and upsell CTA.
6. Implement metadata footer — deck title, page number, optional confidentiality watermark, optional live-link QR.
   **Files / packages touched:** `workers/export-render-pdf/src/{render,vectorize,tag}.ts`, `workers/export-render-pptx/src/{render,downgrade,embed}.ts`, `services/export-pipeline/src/{snapshot,degrade}.ts`, `apps/editor/src/components/share/ExportPdfDialog.tsx`.
   **Contracts produced:** `export_pdf.v1.yaml`, `export_pptx.v1.yaml` (share `POST /v1/exports` with format discriminator).
   **Tests written:**

- Unit: 3D slide flattens to poster with `degraded_slides` entry; live-binding slide shows snapshot timestamp + stale indicator.
- Unit: PPTX compatibility downgrade strips modern gradients/SVG/live video for 2019 target.
- E2E: 50-slide deck round-trip → PDF + PPTX with correct footer metadata.
- Accessibility: PDF/UA tag check passes on a fixture (manual + automated).
  **DoD:** Both formats work in staging; degradation list populated; live-link QR renders.

### W9 — SEO snapshots, social cards, print handouts

**Sub-owner:** SEO / Social / Print lead
**Goal:** Ship SEO-ready public decks, per-deck + per-slide OG cards, and 1/2/3/4/6/9-up handout layouts with handwritten-note lines.

**Tasks.**

1. Implement `services/seo-snapshot` — server-rendered HTML for crawlers with semantic markup (`<h1>` per slide title, JSON-LD `PresentationDigitalDocument`, OG tags), `sitemap.xml` generator per workspace, `robots.txt` policy.
2. Implement per-slide OG card generator (`services/social-card`) — 1200×630 PNG via the same headless renderer as W7; composition rules (`title_hero | chart_hero | quote_hero`); CDN cache keyed by `deck_version_id + slide_id + theme_id`.
3. Implement `services/print-layout` — CSS `@page` rules for handout templates; per-page QR-to-live-link; CMYK conversion option.
4. Wire `deck.updated` propagation hook to invalidate SEO snapshots and social cards within 5 s.
5. Per-slide "exclude from SEO snapshot" flag — emits `<meta name="robots" content="noindex">` per-slide.
6. Implement rate-limit per workspace on social-card generation to prevent abuse.
   **Files / packages touched:** `services/seo-snapshot/src/{render,emit,sitemap,robots}.ts`, `services/social-card/src/{compose,cache}.ts`, `services/print-layout/src/{handout,qr,cmyk}.ts`, `db/migrations/2026Q4/p14_seo_social_print.sql`, `apps/editor/src/components/share/{SeoPanel,SocialCardPreview,HandoutPicker}.tsx`.
   **Contracts produced:** `seo_metadata.v1.yaml`, `social_card.v1.yaml`, `handout_template.v1.yaml`.
   **Tests written:**

- Unit: JSON-LD validates against `schema.org/PresentationDigitalDocument` schema.
- Unit: per-slide `<meta name="robots" content="noindex">` emits only on flagged slides.
- E2E: 1200×630 PNG produced; Twitter `summary_large_image`, LinkedIn, Slack unfurl previews render correctly.
- Visual regression: 8 white-label themes × scroll/standard mode × handout layouts in Percy/Chromatic.
  **DoD:** Lighthouse SEO ≥ 95 on a public fixture deck; social cards render in Twitter / LinkedIn / Slack validators; handouts compose via `@page` rules.

### W10 — Update propagation event bus + CDN invalidation

**Sub-owner:** Propagation lead
**Goal:** Wire the `deck.updated` event bus so live shared links re-render within ≤5 s end-to-end, exports remain version-pinned, and SEO/social caches invalidate within 5 s.

**Tasks.**

1. Implement `services/event-bus` publishers — `deck.updated`, `link.updated`, `domain.verified`, `export.completed`, `card.generated`, `watermark.applied`.
2. Implement CDN invalidation hook — purge-by-tag (`deck:{id}:v{version}`) for SEO snapshots and social cards; soft-expire for renderer HTML (stale-while-revalidate).
3. Implement renderer subscription — long-poll / SSE scoped to `(workspace_id, deck_id)`; debounce 1 s on the renderer side; queue rehydration until interaction completes.
4. Implement debounce 2 s on `version_id` bumps from autosave (P03 contract).
5. Implement graceful bounce on incompatible edit (e.g., viewer was on a slide that was removed) — reroute to nearest valid slide with info notice.
6. Implement audit-log entry for every `deck.updated` event with `actor`, `ts`, `version_id`, `affected_links`.
   **Files / packages touched:** `services/event-bus/src/{publish,subscribe}.ts`, `infra/terraform/cdn-edge/invalidation.tf`, `apps/web-viewer/src/runtime/{SseClient,RehydrateGuard}.ts`, `services/access-policy/src/handlers/version-pin.ts`.
   **Contracts produced:** `deck_updated.v1.json` (event payload), `cdn_invalidation.v1.json` (purge-tag grammar).
   **Tests written:**

- Performance: edit a deck → ≤5 s end-to-end propagation in CDN-cached and origin cases.
- Property-based: rapid N edits debounce to M rehydrations (M ≤ 1.5·N, well below thrash).
- Negative: viewer mid-interaction does not lose form state; bounce to nearest valid slide works.
- Negative: export job pinned to `version_id` at job creation is unaffected by later edits.
  **DoD:** Live shared link re-renders on edit within ≤5 s; SEO + social caches invalidate; export remains version-pinned.

---

## 5. Architecture & Data

References: `/docs/04-system-architecture.md` (services under `/services/`, packages under `/packages/`, client modules under `/apps/`), `/docs/05-data-database-design.md` (11 new tables, all in `domio` schema, tenant isolation via `workspace_id` + RLS), `/docs/06-technology-stack.md` (Node.js/TypeScript for services, Rust/WASM for the edge access-policy module, PostgreSQL, Redis, S3-compatible object store, headless Chromium + `ffmpeg` for export, OpenTelemetry), `/docs/07-security-planning.md` (CSP, signed tokens, ACME, watermark forensics), and `sharing-publishing.md` §4–§7 for the full service map and contract shapes.

**New Postgres tables (per `sharing-publishing.md` §5):**

```sql
share_link              -- per-share URL row; pinned_version_id, status, expires_at, max_views
link_policy             -- level, password_hash, allowed_email_domains, sso_idp_id, watermark_profile_id, geo_allowlist, rate_limit_per_ip
link_visibility_rule    -- (link_id, slide_id, visibility)
watermark_profile       -- text_template, opacity, rotation, tile_density, steg_channel, dct_strength
custom_domain           -- verification_token, acme_account_id, cert_pem, cert_expiry, white_label_theme_id
white_label_theme       -- tokens (validated allowlist), logo_url, favicon_url, loading_copy, footer_text
embed_config            -- allowed_parents, show_chrome, show_export, show_watermark, post_message_enabled
narration_track         -- deck_id, language, source, cues, hls_url, captions_vtt_url
export_job              -- format, options, status, progress_pct, artifact_url, degraded_slides, version_id (pinned)
seo_metadata            -- title, description, canonical_url, og_image_url, twitter_card, robots, json_ld
social_card             -- deck_id, scope (deck|slide), slide_id, version_id, theme_id, composition, image_url
handout_template        -- layout, notes_position, include_lines, qr_code, page_size, color_profile
```

Full DDL with check constraints, FKs, and RLS policies in `db/migrations/2026Q4/p14_shares.sql`, `p14_watermark.sql`, `p14_domains.sql`, `p14_embed.sql`, `p14_narration.sql`, `p14_exports.sql`, `p14_seo_social_print.sql`. Indexes: `ix_share_link_deck`, `ix_share_link_workspace`, `ix_share_link_status_expires`, `ix_lvr_link`, `(deck_id, scope, slide_id, version_id, theme_id) UNIQUE` on `social_card`, `ix_export_job_status`, `ix_export_job_workspace`.

**New services & packages:**

- `/services/share-api/` — REST endpoints per W1 (`POST/PATCH/GET/DELETE /v1/shares/...`, `.../policy`, `.../rotate-token`, `.../extend-expiry`).
- `/services/access-policy/` — edge-deployable decision module (Wasm/Workers + Go control plane); evaluated at CDN edge.
- `/services/seo-snapshot/` — server-rendered HTML, `sitemap.xml`, `robots.txt`, JSON-LD.
- `/services/watermark/` — visible overlay, forensic steg, DCT-mod, per-viewer variant cache.
- `/services/custom-domain/` — DNS verification, ACME DNS-01 driver, cert issuance/renewal.
- `/packages/white-label-tokens/` — allowlist schema + sanitizer + JSON validator.
- `/services/white-label/` — theme bundling, head injection, default baseline preservation.
- `/services/embed-proxy/` — CSP synthesis, sandbox flags, allowed-parents enforcement, `postMessage` server side.
- `/packages/embed-protocol/` — `postMessage` protocol v1.0 types + helpers.
- `/services/narration/` — track ingestion, cue packaging, HLS packaging, WebVTT sidecar.
- `/services/export-pipeline/` — job queue, storage, priority lanes, `degraded_slides` reporting.
- `/workers/export-render-mp4/`, `/workers/export-render-pdf/`, `/workers/export-render-pptx/` — headless render pools.
- `/services/social-card/` — 1200×630 PNG composer, CDN cache, rate limiter.
- `/services/print-layout/` — handout `@page` rules, QR generator, CMYK conversion.
- `/services/event-bus/` — `deck.updated`, `link.updated`, `domain.verified`, `export.completed` publishers + subscribers.
- `/packages/signed-link-token/` — HMAC-SHA256 mint/verify, nonce store.
- `/apps/web-viewer/` — single-page renderer; mobile-first; per-slide code-split; narration runner; SSE client.
- `/apps/editor/src/components/share/` — ShareDialog, LinkPolicyPanel, VisibilityRules, WhiteLabelPreview, EmbedSnippet, ExportMotionDialog, ExportPdfDialog, SeoPanel, SocialCardPreview, HandoutPicker.

**New infrastructure:**

- `/infra/terraform/cdn-edge/access-policy.tf` — CDN edge policy module.
- `/infra/terraform/acme/` — ACME DNS-01 driver (Cloudflare / Route53 / manual), `Certificate` CRDs, renewal cron.
- `/infra/terraform/cdn-edge/invalidation.tf` — purge-by-tag strategy + stale-while-revalidate config.

**Migrations (under `db/migrations/2026Q4/`):**

- `p14_shares.sql` — `share_link`, `link_policy`, `link_visibility_rule`, `embed_config`, `seo_metadata` + indexes + RLS.
- `p14_watermark.sql` — `watermark_profile` + indexes.
- `p14_domains.sql` — `custom_domain` + indexes; cert encrypted columns.
- `p14_themes.sql` — `white_label_theme` + token allowlist check constraint.
- `p14_narration.sql` — `narration_track` + indexes.
- `p14_exports.sql` — `export_job` + indexes.
- `p14_seo_social_print.sql` — `social_card`, `handout_template` + indexes.

**Contracts produced (versioned `/v1`):**

- OpenAPI: `shares.yaml`, `watermark_apply.yaml`, `watermark_profile.yaml`, `custom_domain.yaml`, `white_label_theme.yaml`, `embed_config.yaml`, `narration_track.yaml`, `export_job.yaml`, `seo_metadata.yaml`, `social_card.yaml`, `handout_template.yaml`.
- JSON-Schema: `link_policy.v1.json`, `link_visibility_rule.v1.json`, `watermark_profile.v1.json`, `access_policy.v1.json`, `viewer_url.v1.json`, `narration_cue.v1.json`, `post_message_protocol.v1.json`, `deck_updated.v1.json`, `cdn_invalidation.v1.json`, `embed_config.v1.json`.
- TypeScript: `@domio/contracts/types/share/*`, `@domio/contracts/types/watermark/*`, `@domio/contracts/types/export/*`, `@domio/contracts/types/seo/*`, `@domio/contracts/types/embed/*`.

---

## 6. Verification

| Feature                | Test                                                                                               | Expected result                                                                                                  | Owner        |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| #155 AC-155.1          | Mobile (360 px), tablet (768 px), desktop (1280 px) viewport check on a 50-slide fixture deck      | No horizontal scroll; no overflow; FID < 100 ms                                                                  | W2 lead      |
| #155 AC-155.2          | Lighthouse mobile run on the fixture deck                                                          | Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, Best Practices ≥ 95                                              | W2 lead      |
| #156 AC-156.1          | Scroll mode renders 50-slide deck; FPS captured via DevTools Performance                           | ≥ 55 FPS desktop, ≥ 30 FPS mid-tier Android                                                                      | W2 lead      |
| #156 AC-156.2          | `prefers-reduced-motion: reduce` honored; deep-link `#s=4&t=12s` resolves                          | Animations collapsed; URL fragment rehydrates state                                                              | W2 lead      |
| #157 AC-157.1–AC-157.5 | Public, password, domain_restricted, sso, request_access flows in 5 scenarios                      | Each level gates correctly; wrong password 5× → soft lockout + email; SSO IdP outage → graceful "try again" page | W2 lead      |
| #158 AC-158.1          | Visible watermark appears server-rendered in viewer HTML (not CSS class)                           | Watermark text present in raw HTML response                                                                      | W3 lead      |
| #158 AC-158.2          | Forensic decode harness against two viewers of same fixture                                        | Distinct claims recovered; signal survives screenshot, screen recording, re-encode                               | W3 lead      |
| #158 AC-158.3          | Expiry reached mid-session; 60 s warning; 410 Gone page                                            | Graceful termination; form state preserved 30 s in localStorage                                                  | W3 lead      |
| #159 AC-159.1          | Hidden slides absent from viewer HTML/JS                                                           | Byte-count check + grep for known slide text → 0 hits                                                            | W3 lead      |
| #159 AC-159.2          | Watermarked-only slide rendered with watermark covering ≥ 35 % of slide area                       | Visual regression check                                                                                          | W3 lead      |
| #160 AC-160.1          | Custom domain add → DNS verify → ACME DNS-01 → TLS handshake → renderer loads under new domain     | All steps green; no broken cert served                                                                           | W4 lead      |
| #160 AC-160.2          | White-label token sanitizer rejects `expression()`, `url(javascript:...)`, `@import`, `behavior:`  | 4 negative tests all return 400                                                                                  | W4 lead      |
| #161 AC-161.1          | Embed in Notion / Confluence / WordPress                                                           | Live interactivity preserved; postMessage `slide:change` observed                                                | W5 lead      |
| #161 AC-161.2          | Embed on a denied parent domain                                                                    | 403 received; no deck content leakage                                                                            | W5 lead      |
| #162 AC-162.1          | Narrated deck plays, scrubs, pauses on hotspot click                                               | Sync restored to ±50 ms; 200 ms pause guard respected                                                            | W6 lead      |
| #162 AC-162.2          | `prefers-reduced-data` disables auto-advance                                                       | Manual click advances; audio continues                                                                           | W6 lead      |
| #163 AC-163.1          | 50-slide deck → MP4 1080p with animations                                                          | ≤ 25 min wall; correct `degraded_slides` populated                                                               | W7 lead      |
| #163 AC-163.2          | Determinism: two runs of same deck                                                                 | Byte-identical for first 600 frames                                                                              | W7 lead      |
| #164 AC-164.1          | 50-slide deck → PDF + PPTX                                                                         | Footer metadata correct; interactive elements snapshot with QR-to-live link                                      | W8 lead      |
| #164 AC-164.2          | 3D-heavy deck → PDF                                                                                | 3D slides flattens to poster; `degraded_slides` populated                                                        | W8 lead      |
| #165 AC-165.1          | Public deck `sitemap.xml` lists all public links; `<lastmod>` reflects deck update time            | Validates against sitemap schema; crawler walks internal `<a>` links                                             | W9 lead      |
| #165 AC-165.2          | Author toggles deck public → password; SEO snapshot purged within 60 s                             | `<meta name="robots" content="noindex">` emits if pre-purge request; sitemap updated                             | W9 lead      |
| #166 AC-166.1          | Per-deck + per-slide OG card generated; Twitter / LinkedIn / Slack validators parse                | 1200×630 PNG; `og:url`, `og:title`, `og:image` populated                                                         | W9 lead      |
| #167 AC-167.1          | Handout layouts 1/2/4/6/9-up on A4 and Letter                                                      | CSS `@page` rules compose correctly; notes position respected                                                    | W9 lead      |
| #168 AC-168.1          | Edit a deck → live shared link re-renders within ≤ 5 s                                             | End-to-end propagation ≤ 5 s in CDN and origin cases                                                             | W10 lead     |
| #168 AC-168.2          | Export job pinned to `version_id` at job creation is unaffected by later edits                     | Job artifact identical before/after post-submission edit                                                         | W10 lead     |
| Cross-cutting          | OWASP crosswalk per `sharing-publishing.md` §7.8 — CSP, signed tokens, watermarks, ACME            | All ten mitigations verified                                                                                     | P20 reviewer |
| Cross-cutting          | RLS isolation test — workspace A cannot read workspace B's `share_link`, `watermark_profile`, etc. | 0 rows returned from cross-tenant query                                                                          | P20 reviewer |

**Performance benchmarks (CI gates):**

- Renderer origin TTFB ≤ 200 ms p95; CDN-edge TTFB ≤ 50 ms p95.
- Bundle budget: first-paint JS ≤ 90 KB gzipped; per-slide bundle ≤ 25 KB gzipped; CSS ≤ 12 KB gzipped; ≤ 2 webfonts ≤ 80 KB.
- Scroll FPS: ≥ 55 desktop, ≥ 30 mid-tier Android.
- Export: MP4 1080p ≤ 25 min/50-slide; MP4 4K ≤ 60 min/50-slide; PDF ≤ 5 min/50-slide.
- Watermark: visible overlay ≤ 8 ms added to TTFB; forensic variant ≤ 250 ms p95 per asset.
- Update propagation: end-to-end ≤ 5 s (debounce 2 s writer + ≤ 3 s CDN invalidation + rehydrate).

---

## 7. Risks & Open Decisions

| #       | Risk / decision                                                                                                                                              | Mitigation                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-14-1  | **Per-viewer asset variant caching cost.** At 1 M viewers × 50 slides, the variant cache is large.                                                           | LRU 30 d retention; S3 lifecycle policy; per-workspace cap with eviction; storage team to confirm before scale. (Open Q1 in `sharing-publishing.md` §12.)                           |
| R-14-2  | **Forensic watermark claims leakage / chain of custody.** A viewer screenshot posted publicly is recoverable, but the _legal_ chain of custody needs review. | Documented in link owner's privacy policy; legal counsel sign-off required before GA; forensic decode harness is part of the security review.                                       |
| R-14-3  | **ACME rate limits.** LE has a 50 cert/week per-domain cap; bulk enterprise onboarding may saturate.                                                         | Multi-CAA strategy and LE account pooling deferred to P22 polish; v1 mitigates with per-workspace cert quota and backoff.                                                           |
| R-14-4  | **PDF/UA full compliance.** PDF/UA is a deep spec; v1 targets structural conformance.                                                                        | Automated PDF/UA tag check plus manual remediation for edge cases; full compliance uplift in P22.                                                                                   |
| R-14-5  | **`deck.updated` race with viewer interaction.** Rapid edits thrash the renderer; viewer mid-form loses state.                                               | Debounce 2 s writer-side; debounce 1 s renderer-side; queue rehydration until interaction completes; "deck updated, refresh to view" pill.                                          |
| R-14-6  | **3D export software-WebGL cost.** SwiftShader/angle fallback ≈ 3× render time per 3D-heavy slide.                                                           | Bulk lane priority; per-tenant concurrency cap; `degraded_slides` clearly lists the affected slides; P22 polish may add hardware-GPU pool.                                          |
| R-14-7  | **Embed CSP for arbitrary parents.** Some hosts strip iframes or set restrictive CSP that breaks embeds.                                                     | Bookmarklet fallback for known iframe-strip sites; `<noscript>` link with image snapshot of slide 1; documented in share dialog.                                                    |
| R-14-8  | **Narration cue-point drift under load.** Live-cue anchoring fails if HLS chunk arrival exceeds the 200 ms resume guard.                                     | BufferGuard engages "narrated but paused" within 200 ms; retry with backoff; cue points stored redundantly.                                                                         |
| R-14-9  | **White-label token `expression()` injection.** A malicious workspace uploads a white-label theme that bypasses sanitizer.                                   | Strict allowlist at sanitizer; no `url()`, no `@import`, no `behavior:`, no `expression(...)`, no `@keyframes`; CSP `style-src 'self' 'unsafe-inline'`; quarterly penetration test. |
| R-14-10 | **Open: AI-generated deck descriptions for SEO.**                                                                                                            | P22 polish; v1 uses author-supplied metadata.                                                                                                                                       |
| R-14-11 | **Open: visitor-claimed customization per public viewer.**                                                                                                   | P21 frontier; out of scope here.                                                                                                                                                    |
| R-14-12 | **Open: Bangla typography in handout rendering.**                                                                                                            | Default Latin fonts in v1; bn-BD glyph fallback in P22 polish.                                                                                                                      |
| R-14-13 | **Open: per-workspace quota for social-card generation.**                                                                                                    | Rate-limit per workspace; abuse detection on sustained generation; flag for review on burst.                                                                                        |
| R-14-14 | **Open: handshake for `postMessage` protocol v2.0.**                                                                                                         | v1.0 protocol stamped on every message; v2 backward-compatible additions reserved in protocol spec; migration plan in P22.                                                          |

---

## 8. Demo

**Demo title: "Send a deck, share a URL, govern a presentation."**

**Pre-demo setup (T-1 day):**

1. Sandbox tenant `domio-design` with a 30-slide product deck containing: title slide, 14-bar chart, a 3D product model, a smart-component KPI card, a hotspot with branching navigation, a video embed, and a live-data chart bound to a Google Sheet.
2. Two pre-generated share links: `link-public` (public, expires 7 d, no watermark) and `link-confidential` (password `conf2026`, visible-only watermark, slide-level visibility hiding the financials slide).
3. Custom domain `demo.domio.staging.io` verified, ACME cert issued, white-label theme "Acme Branding" applied.
4. One narrated track with 5 cues recorded.
5. One scheduled export (MP4 1080p) and one PDF export queued.

**Script (15 min):**

1. **Deck-as-URL.** From the editor, click Share → copy URL. Open in mobile (360 px), tablet (768 px), desktop (1280 px) viewports — no horizontal scroll; Lighthouse mobile ≥ 90. _(#155)_
2. **Scroll mode.** Toggle scroll mode in the preview. Scroll through 30 slides; FPS ≥ 55 on desktop, ≥ 30 on Android; deep-link `#s=12&t=8s` jumps to slide 12 with 8-second state. _(#156)_
3. **Access levels.** Try `link-confidential` in an incognito window — password prompt; correct password → in. Wrong password 5× → soft lockout + owner email. Try `link-public` — opens immediately. Switch to `domain_restricted` for `@acme.com` — viewer not on that domain is denied with a friendly page. _(#157)_
4. **Expiry and watermark.** Set `expires_at` to 1 minute on a new link; load → 60 s warning; expiry → 410 Gone with snapshot. Try a link with `both` watermark — visible overlay shows `{email} • {ip_short} • {ts}`; copy HTML response → text is server-rendered, not CSS. _(#158)_
5. **Per-link visibility.** Open `link-confidential` — financials slide is hidden. Open DevTools network → confirm zero footprint. Editor badge shows "hidden from link-confidential". _(#159)_
6. **Custom domain.** Browse `https://demo.domio.staging.io/d/{short_id}` — TLS handshake, white-label theme, Acme logo, footer "Internal use only". Sanitizer rejects `expression(...)` token on a test theme. _(#160)_
7. **Embed.** Paste embed snippet into a Notion test page; embed renders with live interactivity; `postMessage` `slide:change` fires on navigation. Try embedding on `denied.example.com` → 403 with no leakage. _(#161)_
8. **Narration.** Open `link-public` with narration track — audio plays in sync; scrub to a cue → snaps; click a hotspot → 200 ms pause, audio resumes within ±50 ms. _(#162)_
9. **Export.** Queue MP4 1080p — job visible in `ExportHistory` with progress; complete within budget; download artifact. Queue PDF + PPTX — both include QR-to-live link bottom-right; financials slide flattens to static snapshot with timestamp footer. _(#163, #164)_
10. **SEO + social.** View source on `link-public` → JSON-LD `PresentationDigitalDocument`, per-slide `<article>` with `<h1>`. View `/sitemap.xml` — listed. Open Twitter card validator — 1200×630 PNG renders. _(#165, #166)_
11. **Handout.** Export 2-up handout with notes right; preview shows slide + notes + handwritten lines; QR-to-live-link per page. _(#167)_
12. **Update propagation.** Edit slide 3 title in the editor. Live shared link re-renders within ≤ 5 s (visible in a second window). SEO snapshot and social card invalidate. Pre-existing MP4 export is unchanged (pinned to the old `version_id`). _(#168)_
13. **Determinism + performance.** Re-run the MP4 export — first 600 frames byte-identical. Lighthouse mobile run on the public link — Performance ≥ 90. _(#155, #163)_

**Pass criteria.** All 14 acceptance groups (#155–#168) are exercised. A "Demo passed" GitHub check is set when the Playwright suite covering flows 1–13 is green, and the CI performance gates (§6) succeed. Status: `Internal demo passed`.

---

## 9. Definition of Done

- [ ] Code merged to `main` behind a single feature flag `p14_sharing_publishing` (default OFF in prod until GA criteria met).
- [ ] All 11 OpenAPI specs versioned in `/contracts/openapi/v1/`; 10 JSON Schemas versioned in `/contracts/json-schema/`; TypeScript types generated.
- [ ] `pnpm test` green: unit (policy engine, watermark, sanitizer, signed-token, layout) ≥ 80 % coverage; integration suites for share-api, access-policy, watermark, custom-domain, embed-proxy, narration, export-pipeline, seo-snapshot, social-card, print-layout green; Playwright `p14-sharing-publishing.spec.ts` green.
- [ ] Performance CI gates green: TTFB p95 ≤ 200 ms origin / ≤ 50 ms edge; bundle budgets; scroll FPS; export budgets; update propagation ≤ 5 s; deterministic 600-frame byte-identity.
- [ ] Security review signed off by an engineer not on the feature: CSP per `sharing-publishing.md` §7.5; OWASP crosswalk §7.8; forensic-watermark decode harness green; white-label sanitizer rejects 4 injection vectors.
- [ ] Telemetry in place: counters `policy_decision_total{decision,reason}`, `policy_decision_duration_seconds`, `viewer_html_ttfb_seconds`, `watermark_apply_total`, `custom_domain_renewal_total`, `export_queue_depth`, `cdn_invalidation_total`; histograms `policy_decision_duration_seconds`, `export_job_duration_seconds`; alerts for `policy_decision_latency_p95 > 50ms`, `cert_renewal_failure`, `acme_rate_limit_warning`, `viewer_ttfb_p95 > 500ms`, `cdn_error_rate_spike`.
- [ ] Migrations applied in dev + staging; revert plan verified; RLS policies enforced and tested.
- [ ] Documentation updated: `/docs/sharing-publishing.md` cross-linked from this phase; runbook for `access-policy` edge module, `watermark` service, `custom-domain` ACME driver, `export-pipeline` worker pool; share-link author guide; embed parent allowlist guide.
- [ ] Design partner deck validated end-to-end with a non-Domio user (one design partner at minimum).
- [ ] "Internal demo passed" status granted after the demo script runs green.
- [ ] Hooks left for downstream phases: `share_link` API is the substrate P16 mints per-session handout URLs from; `deck.updated` bus is the substrate P15 presenter rehydrate consumes and P17 analytics ingests; `export_job` is the substrate P15 post-presentation recap reuses; `version_id` is the substrate P21 living documents and P18 approval workflow build on; MCP tool stubs (`create_share_link`, `apply_watermark`, `queue_export`, `attach_custom_domain`) emit here per `sharing-publishing.md` §6.6 and are wrapped by P13.

---

_Document path: `/home/daiyaan2002/Desktop/Projects/domio/docs/development_phases/phase-14-sharing-publishing-deck-as-website.md`_
_Source docs (unchanged): `feature-list.md`, `pre-development-planning-guide.md`, `sharing-publishing.md`, `editor-canvas.md`, `animation-transitions.md`, `live-data-charts.md`, `theming-branding.md`, `components-templates.md`, `3d-motion-media.md`, `ai-copilot.md`, `agentic-interfaces.md`, `enterprise-governance.md`._
