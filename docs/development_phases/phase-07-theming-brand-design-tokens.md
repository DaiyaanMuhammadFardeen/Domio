# Phase 07 — Theming, Brand & Design Tokens

| Field               | Value                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase number**    | 07                                                                                                                                                                                                                                                           |
| **Name**            | Theming, Brand & Design Tokens                                                                                                                                                                                                                               |
| **Owner(s)**        | Stream A lead (theme-service + brand-service), Designer/UX (token editor + brand kit wizard), Frontend lead (token picker + override chip), Graphics engineer (OKLCH math + theme application), Security (font license + brand extraction scraping policies) |
| **Critical path?**  | No (deepening)                                                                                                                                                                                                                                               |
| **Parallel stream** | **Stream A — Ecosystem** (runs parallel with P06, P08, P09, P10, P11, P12, P13 after P05 ships)                                                                                                                                                              |
| **Unblocks**        | P14 (share-link & export embed resolve tokens), P15 (presenter offline resolves brand tokens), P17 (analytics consumes brand context id for filtering), P19 (marketplace themes surface ships), P20 (governance dashboard reads brand-kit immutable records) |

**Intent.** Land the design-system substrate that every rendering subsystem resolves through. The phase delivers the typed design-token registry (#37), the transactional one-click theme swap (#38), the organization-level brand kit (#39) including logo / palette / font / imagery rules, the URL-driven brand extraction worker with scraping safeguards (#40), multi-brand contexts for agencies (#41), custom-font upload with license tracking and fallback chain construction (#42), the automatic dark/light generator that preserves brand identity in OKLCH (#43), accessibility-aware theming with WCAG + colorblind-safety validation (#44), the theme marketplace with live demo renderer (#45), the deck-wide style linter with one-click fixes (#46), and per-slide theme overrides with a fully-specified inheritance chain (#47). The theme engine built here is the resolution layer for #38, #46, #47, the canvas (#1–22), the chart palettes (#48–#64), AI redesign (#112, #122), agent edits (#221–236), and the brand-governance dashboard in P20 — every concrete color, font, radius, or motion value in the platform flows through `theme_service.resolve()`.

---

## 1. Goals

- A workspace admin can define a typed design-token registry with colors (sRGB + P3 OKLCH), typography, spacing, radius, shadow, motion, content, and border groups; aliases resolve recursively with cycle detection; deleting a referenced token is blocked with a referrer list (#37).
- A user can apply a theme to a 200-slide deck in under 300 ms p95 as a single undoable CRDT transaction; layout geometry is preserved; locked regions stay untouched; per-slide overrides survive the swap (#38, #36, #47).
- A brand kit can be authored from scratch or generated from a URL paste; the URL extraction is `robots.txt`-honoring, rate-limited, idempotent (content-hash cache), and produces a draft kit with a non-repudiable `attribution` record plus a mandatory `extractionAttestation` before publish (#39, #40).
- An agency workspace can host N independent brand contexts; decks, components, and templates carry their brand context of origin; cross-brand asset reuse is permissioned and audited (#41).
- Users can upload custom fonts with automatic license-status inference, glyph-coverage reporting per Unicode block, style-matched fallback chain construction, and per-font subsetting served from a CDN with deterministic URLs (#42).
- A one-click "Generate Dark from Light" produces a paired theme preserving brand identity (OKLCH hue ±10°, chroma ±10 %) and passes a perceptual identity test (#43); the pair is contrast-audited (#44).
- Every content/background token pair is WCAG-checked on creation and on every edit; colorblind-unsafe palettes trigger a one-click fix that preserves hue-spacing ≥ 30° in OKLCH; `prefers-reduced-motion` and `prefers-reduced-transparency` are respected via dedicated token aliases (#44).
- The theme marketplace publishes listings with live, sandboxed demo renders against a canonical sample deck; installs verify content hash and never auto-apply to existing decks (#45).
- Style lint runs on a 200-slide deck in under 1 s p95; findings group by token; one-click fixes replace literal values with the nearest brand token in OKLCH; locked regions and overrides are excluded (#46).
- Per-slide theme overrides carry scope (`slide | slide-range | section | auto-layout-child-set | state-conditional`); the inheritance chain `per-slide override > deck theme > brand context theme > org default theme` is inspectable in the UI; state-conditional overrides react to variables and scenarios (#47).
- Telemetry, license checks, and audit events are in place so P19 can publish themes to the marketplace surface and P20 can audit brand-kit mutations without rework.

---

## 2. Scope

### 2.1 In scope (feature numbers)

|   # | Feature                                                                                                                                                                                                                                                         |
| --: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  37 | Design token system — typed groups (color, typography, spacing, radius, shadow, motion, content, border), stable IDs, alias chains with cycle detection, deletion blocked by referrer list                                                                      |
|  38 | One-click theme swap — transactional structural update, < 300 ms p95 on 200 slides, preserves layout geometry and per-slide overrides, skips brand-locked regions                                                                                               |
|  39 | Brand kit (org/workspace-level) — name, owner, scope, logos (light/dark/mono × ≥ 4 sizes), palettes, type system, imagery rules, sub-brand inheritance, immutable published form                                                                                |
|  40 | Brand extraction from URL — fetch + sanitize + analyze + cluster + propose pipeline; per-org rate limits; `robots.txt` honored; idempotent; `attribution` block; mandatory `extractionAttestation`                                                              |
|  41 | Multi-brand support — N brand contexts per workspace; active brand per deck/slide; archived contexts hidden from pickers but resolvable; brand-context-scoped agent permissions                                                                                 |
|  42 | Custom font upload — `.woff2`/`.woff`/`.otf`/`.ttf`/`.ttc`; license status inference (OFL/RESTRICTED/UNKNOWN); glyph-coverage report per Unicode block; auto fallback chain; CDN subsetting; SHA-256 duplicate detection; anti-piracy heuristics                |
|  43 | Automatic dark/light variants — OKLCH hue ±10°, chroma ±10 %, lightness remap; multi-step surface scale; chroma compensation for Helmholtz-Kohlrausch; custom-override preservation; `prefers-color-scheme` token output                                        |
|  44 | Accessibility-aware theming — WCAG 2.x + APCA `prefers-contrast: more`; deuteranopia/protanopia/tritanopia simulations; colorblind-safe palette suggestions with ≥ 30° OKLCH hue spacing; reduced-motion/reduced-transparency token aliases; forced-colors mode |
|  45 | Theme marketplace with previewable live demos — canonical sample deck schema; sandboxed iframe; `prefers-color-scheme` toggle in URL hash; license bundle enforcement; content-hash verification on install                                                     |
|  46 | Style lint — off-brand color/font detection; bucket into BLOCK/WARN/INFO; OKLCH ΔE ≤ 5 = near-brand; bulk one-click fix to nearest brand token or role-matched semantic token; chart-palette identifiability check under CVD                                    |
|  47 | Per-slide theme overrides — partial-token override set; inheritance chain `per-slide > deck > brand > org`; bulk operations; state-conditional overrides reacting to variables and scenarios; promote to deck/section in one click                              |

### 2.2 Out of scope

- **Theme marketplace storefront UI** — feature #45's marketplace surface (catalog grid, listing detail page, checkout) ships in P19. This phase delivers the live demo renderer, the install endpoint, and the license-bundle contract; the storefront is reused from the marketplace shell in P06.
- **Marketplace billing / payout execution** — deferred to P19; this phase emits `marketplace_listing`, `license_grant`, and `revenue_share_event` rows but does not move money.
- **Brand governance dashboard** — feature #194 (read-only audit rollups, license violation surfacing) lives in P20. This phase emits the audit events; the dashboard consumes them later.
- **AI-driven theme generation / AI accessibility audit suggestions** — features #112 (AI redesign constrained by tokens), #122 (AI accessibility assistant), #123 (AI chart palette selection) are owned by P12. The hooks (`theme.auditA11y()`, `theme.suggestPalette()`) are exposed here as API surfaces that P12 calls into.
- **AI brand-extraction-from-image** — image-based brand extraction (#40 covers URL only) is deferred to P12 / P13, with the same `attribution` and licensing rules.
- **Cross-deck theme inheritance** — a deck inheriting tokens from a parent "master deck" is in P18 (collaboration/library features) when shared-slide libraries mature.
- **Forced-colors mode authoring UI** — the renderer respects `forced-colors` mode and exposes `color.system.canvas*` aliases; authoring new tokens specifically for forced-colors mode is deferred to P22 (polish).

---

## 3. Dependencies

### 3.1 Upstream phases (must be complete)

- **P00** — repo, contracts, dev env (`contracts/proto/domio/v1/common.proto`, `Idempotency-Key` header, workspace and tenant IDs).
- **P01** — observability, CI/CD, infra (Prometheus, OTel, S3-compatible object store in MinIO for fonts/logos, multi-region CDN scaffold, NATS JetStream for `theme.applied` events).
- **P02** — deck schema + scene-graph foundation (the `Deck` carries `themeRef`, `brandContextRef`, `themeOverrides[]`).
- **P03** — canvas editor MVP (the renderer applies resolved token values; theme picker slot exists in top bar).
- **P04** — CRDT + presence (`theme.applied` and `theme_overrides.set` ops are part of the multiplayer channel).
- **P05** — persistence, versioning, branches (theme versions are immutable snapshots; branches let a designer fork a brand kit into a draft).
- **P06** — component & template ecosystem (the marketplace plumbing this phase reuses for theme listings: `marketplace_listing`, `license_grant`, `revenue_share_event`; smart-component props resolve tokens).

### 3.2 Downstream phases this unblocks

- **P08** — chart palettes resolve through `theme_service.resolve()`; chart identifiability is checked via the CVD simulation in #44.
- **P09** — animation timelines reference motion tokens; `prefers-reduced-motion` swaps to `motion.reduced.*`.
- **P10** — prototype variables can drive state-conditional theme overrides (#47).
- **P11** — 3D / media assets resolve through brand imagery rules (#39).
- **P12** — AI redesign calls `theme_service.auditA11y()` and `theme_service.suggestPalette()`; AI brand-extraction-from-image writes to the same brand-kit draft pipeline.
- **P13** — MCP `apply_theme` tool (#221) wraps `theme_service.apply()`; agent edits respect brand-lock and brand-context-scoped permissions (#225).
- **P14** — share-link generation and export embed snapshots resolve tokens; theme marketplace installs emit `deck.theme_installed` events into the share payload.
- **P15** — presenter offline resolves brand tokens deterministically; recap API records theme at session start.
- **P17** — analytics consumes `brand_context_id` for filtering; team analytics dashboard reports off-brand violation counts.
- **P18** — review workflow gate runs lint (#46) pre-merge; approval workflows consume brand-kit immutable records.
- **P19** — picks up the theme marketplace storefront UI; installs flow through the same `marketplace_listing` schema.
- **P20** — enterprise governance dashboard reads `brand_kit` (immutable form), `brand_extraction_job.attribution`, and `audit_brand_event` rows for the audit rollups.
- **P22** — forced-colors authoring UI; cross-deck theme inheritance; performance hardening.

---

## 4. Workstreams

### 4.1 WS-THEME-1 — Token registry + resolver

**Tasks (ordered):**

1. **Token schema (`contracts/schema/design-token-v1.schema.json`).**

   - Files: `contracts/schema/design-token-v1.schema.json`, `contracts/proto/domio/v1/theme.proto`.
   - Types: `TokenGroup` enum, `TokenType` (color/dimension/typography/shadow/motion/content), `TokenRef`, `TokenAlias`, `TokenDeprecated`.
   - Tests: AJV suite — valid typed tokens, invalid color (out-of-range channels), invalid typography (missing `fontFamily`), invalid alias (cycle).
   - **DoD:** schema validates 50 hand-authored tokens across all 8 groups.

2. **`theme-service` skeleton.**

   - Files: `services/theme/src/main.ts` (Hono on Node 22), `services/theme/src/{tokens,resolve,apply,audit,marketplace,analytics}/mod.ts`.
   - Tables: `design_token`, `token_alias`, `theme`, `theme_version`, `theme_override`, `theme_application_event`, `audit_brand_event` (see §5).
   - Endpoints: `POST /v1/themes/{themeId}/resolve` (batch token resolution), `POST /v1/themes/{themeId}/apply` (deck-level apply; transactional CRDT transaction generator).
   - **DoD:** service boots, resolves a 200-token batch in < 5 ms p95, AJV gate passes.

3. **`resolve(tokenRef, scope, deckState)` algorithm (§3 of `/docs/theming-branding.md`).**

   - Order: per-slide override → deck theme → brand context theme → org default theme → alias chain (cycle-detected) → system aliases (`prefers-color-scheme`, `forced-colors`) → `null` + `WARN_TOKEN_UNRESOLVED`.
   - Pure & synchronous; leaf values cached per scope.
   - Tests: every precedence level with permutations; alias cycle; deep alias (5+ levels); missing token with referrer id.
   - **DoD:** 30 unit tests + 1 property test (any precedence chain converges).

4. **Alias cycle detection (DFS with memoized visited set).**

   - Returns `409 TOKEN_ALIAS_CYCLE` with the offending chain.
   - **DoD:** save blocked, UI shows red indicator before save.

5. **Token deletion blocker.**

   - On `DELETE /v1/tokens/{tokenId}` → run referrer search across elements, slides, themes, overrides; return `409 TOKEN_REFERENCED` with a count + sample referrers; only force-delete with admin scope and audit log entry.
   - **DoD:** deletion of `color.brand.primary` blocked with the referrer list.

6. **Token edit propagation (< 100 ms for 500-slide decks).**
   - CRDT transaction generator publishes per-element ops in a single transaction (`theme.tokens_changed`).
   - Renderer invalidates affected layers (zoned by bounding box); effect priority by viewport visibility.
   - **DoD:** benchmark < 100 ms p95 with 500-slide deck, 8 k elements.

### 4.2 WS-THEME-2 — Theme model, swap, overrides

**Tasks:**

1. **Theme model.**

   - Tables: `theme`, `theme_version` (immutable snapshot), `theme_override`.
   - Fields: `theme_id`, `name`, `kind` (built-in/marketplace/agency/user), `tokens_resolved` (JSON), `parent_theme_id`, `brand_context_id`, `created_by`, `created_at`, `version`, `signature`.
   - Tests: immutability — modifying a `theme_version` row fails; `parent_theme_id` resolution walks up.
   - **DoD:** a theme applied at deck-level is referenceable from any slide.

2. **Transactional theme apply (`POST /v1/themes/{themeId}/apply`).**

   - Generates CRDT ops for every element that references a token with a different resolved value.
   - Single undo entry (`history.batch` op type) — one `Cmd-Z` reverts the entire swap.
   - Locked regions (`brand_lock_region`) excluded; per-slide overrides preserved; live data bindings and animations untouched.
   - **DoD:** 200-slide swap < 300 ms p95; locked regions verified to remain unchanged; one `Cmd-Z` reverts atomically.

3. **Theme fallback warning.**

   - If target theme lacks a token that the deck references directly, emit `WARN_TOKEN_FALLBACK` with the referrer id and the source token; fall back through the chain.
   - **DoD:** warnings surfaced in the lint panel within 50 ms of apply.

4. **Per-slide theme overrides (`theme_override` table).**

   - Scopes: `slide`, `slide-range`, `section`, `auto-layout-child-set`, `state-conditional`.
   - State-conditional override carries `condition_expr` (variable or scenario comparison, AST).
   - Inheritance inspector in editor surfaces the chain `per-slide > deck > brand > org` for the focused slide.
   - Tests: precedence tests for every scope combination; state-conditional override fires when condition true and reverts when false.
   - **DoD:** override survives a deck-level theme swap; bulk "override on selection" applies; promote to deck/section in one click.

5. **Bulk override editor.**
   - `POST /v1/themes/overrides/bulk` accepts a token + target slides + value; applies as a single transaction with audit log entry.
   - **DoD:** 50 slides selected → 3 tokens overridden in < 500 ms.

### 4.3 WS-THEME-3 — Brand kits, multi-brand, sub-brand inheritance

**Tasks:**

1. **Brand kit schema and table.**

   - Tables: `brand_kit`, `brand_kit_logo`, `brand_kit_palette`, `brand_kit_font`, `brand_kit_imagery_rule`, `brand_kit_sub_brand` (inheritance), `brand_kit_archive`.
   - Fields: `kit_id`, `name`, `owner_org_id`, `scope` (org/workspace/team), `published_at`, `archived_at`, `signature`, `extraction_attestation_id` (nullable).
   - Tests: published-form immutability; fork-to-draft semantics; archive behavior (still resolvable from existing decks).
   - **DoD:** a brand kit can be authored, published, archived, and resolved from any deck.

2. **Brand kit wizard (UX).**

   - Steps: Basics → Logos → Type system → Color tokens → Imagery rules → Preview → Publish.
   - Per-step validation: image min-resolution (logos ≥ 256 px), font license status, color WCAG against background defaults, sub-brand inheritance setup.
   - **DoD:** wizard ships with starter palette and starter type system; publish gated by optional `legal_approval_required` org setting.

3. **Logo SVG sanitization.**

   - Strips remote scripts, `foreignObject`, event handlers; normalizes viewBox; records `source_of_truth_url` and `content_hash`.
   - Tests: SVG with `<script>` rejected; SVG with `<foreignObject>` rejected; valid SVG passes.
   - **DoD:** sanitizer is its own library `logo-svg-sanitize` with 95 % test coverage.

4. **Imagery rules.**

   - Stored as JSON: `doRules`, `dontRules`, `minResolution`, `subjectSafeZonePolygon`, `allowedSources`.
   - Applied at upload time (#114) and AI generation time.
   - **DoD:** rule violations are surfaced as upload-time warnings.

5. **Logo clear-space constraint.**

   - On insert, compute the safe zone polygon; reject drops closer than `clearSpace` to slide edge or other elements unless an explicit "ignore safe zone" affordance is used (flagged by lint #46).
   - **DoD:** a logo with `clearSpace: 24px` cannot be dropped within 24 px of any slide edge.

6. **Multi-brand contexts (`brand_context` table).**

   - A workspace hosts N contexts; each deck references exactly one "default" context with per-slide overrides (#47).
   - Permission `brand.setActive` is required to add/remove/fork/archive contexts.
   - Archived contexts are immutable and hidden from pickers but still resolvable from existing decks.
   - Cross-brand asset reuse requires explicit permission and is recorded in `audit_brand_event` (e.g., "Alice used Brand A's `logo.primary` in Brand B's deck slide 4").
   - **DoD:** agency workspace with 3 brand contexts renders correctly; archived contexts invisible in pickers but still resolve from archived decks.

7. **Sub-brand inheritance.**
   - `brand_kit_sub_brand (parent_kit_id, child_kit_id)` — child inherits parent's tokens; child overrides win; cycles blocked.
   - **DoD:** franchise structure (parent + 3 children) resolves; cycle attempt rejected.

### 4.4 WS-THEME-4 — Brand extraction from URL

**Tasks:**

1. **Extraction worker (`workers/brand-extract/`).**

   - Stages: fetch → sanitize → extract (logos, computed styles, OG image, fonts) → cluster colors → score by frequency × saliency → detect fonts → package draft.
   - Files: `workers/brand-extract/src/{fetch,sanitize,extract,cluster,detect,package}/mod.ts`.
   - Tables: `brand_extraction_job` (`job_id`, `org_id`, `url`, `status`, `stages`, `attribution`, `confidence_scores`, `result`, `created_at`, `completed_at`).
   - **DoD:** extraction completes within budget (median 15 s, p95 60 s); result stored as a brand-kit draft.

2. **Scraping safeguards (non-negotiable).**

   - **Robots honored**: respect `robots.txt` by default; opt-in override per-org for owned domains.
   - **Rate limit**: 1 extraction per URL per 5 minutes; 10 per hour per IP; 100 per day per workspace.
   - **User-Agent**: `Domio-BrandExtractor/1.0 (+contact-email)`; no cookies; no JS execution of third-party trackers.
   - **No double-hop**: links inside the source page are not followed; only the user-provided URL is fetched.
   - **No PII capture**: page text is not stored; only assets and computed styles are.
   - **Dynamic rendering**: opt-in per-job; default is HTTP fetch + static HTML parsing.
   - **DoD:** security review sign-off; scraping-policy test suite verifies each safeguard with a recorded fixture.

3. **Color clustering in OKLCH.**

   - Convert all candidate colors to OKLCH; cluster within ΔE ≤ 2; rank by frequency × saliency (filter out transparent / near-white background-only colors).
   - **DoD:** 5–12-color palette returned with confidence per color.

4. **Logo extraction priority.**

   - Candidates: `<link rel="icon">`, SVG, apple-touch-icon, OG image, header SVG.
   - Pick highest-resolution SVG/PNG ≥ 256 px, preferring SVG.
   - Clearbit-style logo API fallback is **off by default**; admins can enable per-org.
   - **DoD:** at least 1 logo candidate extracted from a typical marketing site; light + dark best-effort.

5. **Font detection.**

   - Parse `@font-face` declarations and Google Fonts links.
   - Detect fonts via font-detection model; produce a candidate manifest.
   - **DoD:** at least 1 web font detected on a typical marketing site; license URL captured when detectable.

6. **Attribution block (`brand_extraction_job.attribution`).**

   - `{ sourceUrl, fetchedAt, contentHash, robotsHonored, licenseDetected?, userAgent }`.
   - Immutable; non-repudiable.
   - **DoD:** every job row carries the attribution block.

7. **Mandatory `extractionAttestation`.**

   - User must check "I have rights to use this" before the extracted kit can be published.
   - `extractionAttestation` field is timestamped and immutable.
   - **DoD:** publish blocked without attestation; audit log entry created.

8. **Failure-mode typed errors.**

   - `BRAND_EXTRACT_FETCH_FAILED`, `BRAND_EXTRACT_ROBOTS_BLOCKED`, `BRAND_EXTRACT_NO_STYLES_FOUND`, `BRAND_EXTRACT_WAF_BLOCKED`, `BRAND_EXTRACT_CAPTCHA_WALL`.
   - Each with a human remediation hint in the UI.
   - **DoD:** all 5 paths covered; UI surfaces remediation hint.

9. **Idempotency.**
   - Re-fetching yields the same `contentHash`; caches are reused (Redis keyed by `sha256(url)`).
   - **DoD:** repeated extractions return the same draft within 1 s.

### 4.5 WS-THEME-5 — Custom fonts

**Tasks:**

1. **Font upload endpoint (`POST /v1/fonts`).**

   - Accepts `.woff2` (preferred), `.woff`, `.otf`, `.ttf`, `.ttc` (single weight = single file; variable font = single file).
   - Per-file 25 MB cap; per-kit 50 fonts default; org admins can raise limits.
   - **DoD:** upload succeeds; 30 MB file rejected with clear error.

2. **License status inference.**

   - Scan embedded `name` table for license markers; detect a license file matching the font stem (`MyFont-LICENSE.txt`).
   - Status: `permissive | restricted | unknown`.
   - **DoD:** an OFL font returns `permissive`; a font with restrictive markers returns `restricted` and is flagged in the brand-kit UI.

3. **Fallback chain construction.**

   - User fonts → style-matched platform fonts → generic `sans-serif`/`serif`.
   - Matches Microsoft, Apple, Google, and Domio bundled fonts.
   - **DoD:** a user's font with no CJK glyphs has CJK fallbacks in the chain.

4. **Glyph coverage report per upload per Unicode block.**

   - Coverage is reported for Latin / Latin-Ext / Cyrillic / Greek / CJK / Bengali / Arabic.
   - If coverage is incomplete for the deck's content locale, the user is warned and the fallback chain takes precedence for missing glyphs.
   - **DoD:** Bengali coverage reported when deck uses Bangla text; missing glyphs trigger a warning.

5. **License expiry tracking.**

   - Tracked when a license has a known expiration (rare; enterprise contracts).
   - Warnings emitted 30 / 7 / 1 days before expiry.
   - **DoD:** scheduled job emits warnings to the brand-kit owner's inbox.

6. **Variable font detection.**

   - Read the font's `fvar` table; expose weight / width / slant axes.
   - Tokens can specify axes explicitly (`typography.heading.weight=600`).
   - **DoD:** a variable font's axes are listed in the brand-kit editor.

7. **CDN serving + lazy subsetting.**

   - Deterministic URLs: `/fonts/{fontId}/{weight}/{subset}.woff2`.
   - Subsetting (Latin / Latin-Ext / Cyrillic / Greek / CJK / Bengali) computed on first request and cached.
   - **DoD:** first request for a CJK subset completes within 2 s; subsequent requests within 50 ms.

8. **SHA-256 duplicate detection.**

   - Per-org dedup; uploading a duplicate surfaces the existing asset.
   - **DoD:** uploading the same font twice returns the existing asset with a "duplicate" notice.

9. **Anti-piracy heuristics.**

   - Detect common "cracked" markers; refuse such uploads with a clear message — "this font appears to be derived from an unlicensed source."
   - False positives overridable by org admins with audit log entry.
   - **DoD:** 5 known cracked marker patterns rejected; admin override logs to `audit_brand_event`.

10. **Style-matched fallback metric-mismatch warning.**
    - Use the bundled `font-metrics.json` (open-source dataset).
    - Surface a warning when fallback fonts have > 5 % x-height or width difference.
    - **DoD:** warning surfaced for known metric-mismatched fallbacks.

### 4.6 WS-THEME-6 — Dark/light pair generation

**Tasks:**

1. **Generation worker (`workers/theme-pair/`).**

   - Files: `workers/theme-pair/src/{lightToDark,surfaces,shadows,borders,content,logos}/mod.ts`.
   - Input: source theme + target direction (light↔dark).
   - Output: paired theme with all token categories resolved.
   - **DoD:** one-click "Generate Dark from Light" produces a complete paired theme.

2. **Color remap in OKLCH.**

   - Lightness flips per a perceptual rule; chroma reduced 10–20 % for Helmholtz-Kohlrausch compensation; hue preserved within ±10° via OKLCH math.
   - **DoD:** brand identity preservation test passes (hue ±10°, chroma ±10 %).

3. **Multi-step surface scale.**

   - `surface.base`, `surface.raised`, `surface.overlay`, `surface.inverse` with defined ΔL per step.
   - **DoD:** 4-step scale renders correctly; visual hierarchy preserved.

4. **Shadow / border / content remap.**

   - Shadows: lightness darkened, opacity reduced (dark UIs use subtle inner glow + outer shadow at lower opacity).
   - Borders: subtle contrast borders in light become subtler or replaced by tonal borders in dark.
   - Content: text colors swap on the surface scale; placeholder/muted colors shift toward neutral (less chroma).
   - **DoD:** all token categories present in generated theme.

5. **Imagery auto-pick.**

   - Logos with explicit light/dark/mono variants auto-pick the right one; photographs are not auto-edited.
   - **DoD:** a brand kit with light + dark + mono logos auto-picks correctly per target direction.

6. **Hue-preservation edge case for high-chroma colors.**

   - For pure yellow `#FFD700` and similar, detection lowers chroma sufficiently while preserving brand identity; user gets a "hue-preserved with chroma adjustment" notice.
   - **DoD:** high-chroma source produces a chroma-adjusted dark variant with a notice.

7. **Custom-override preservation.**

   - If the source theme has explicit dark token overrides and user checks "preserve custom overrides", they are not overwritten.
   - **DoD:** toggle works; preserved overrides shown in the diff preview.

8. **`prefers-color-scheme` token output.**
   - A deck can render in either light or dark based on the viewer's OS preference via a dedicated token alias.
   - **DoD:** a viewer with `prefers-color-scheme: dark` sees the dark variant automatically.

### 4.7 WS-THEME-7 — Accessibility validation

**Tasks:**

1. **WCAG contrast audit on token save.**

   - For every `role: content` token against every `role: background` token.
   - Minima: AA Normal 4.5:1, AA Large 3:1, AAA Normal 7:1, AAA Large 4.5:1, Non-text 3:1.
   - `BLOCK` if AA fails in production contexts; `WARN` for decorative-only.
   - **DoD:** saving a failing contrast token is blocked with a one-click "auto-suggest compliant" or "save anyway (admin-only)" affordance.

2. **APCA for `prefers-contrast: more`.**

   - Uses APCA (WCAG 3 draft) at threshold >= Lc 60 for body text.
   - **DoD:** high-contrast viewers see Lc ≥ 60 contrast on body text.

3. **Colorblind simulation matrices.**

   - Brettel/Vienot/Mollon for dichromacy; Machado for higher-CVD severity.
   - Transformations done in OKLCH to preserve perceived lightness gradients.
   - **DoD:** simulated deuteranopia, protanopia, tritanopia palettes computed in < 50 ms for 50-color palette.

4. **Colorblind-safe palette suggestions.**

   - When a palette is flagged CV-unsafe, propose an alternative palette preserving hue-spacing ≥ 30° in OKLCH, validated against simulated CVD maps.
   - **DoD:** suggestion accepted within 200 ms; replaces all unsafe tokens in one click.

5. **Reduced-motion / reduced-transparency token aliases.**

   - Tokens tagged `motion.reduced.*` and `color.transparency.reduced.*` resolve for users with the corresponding media query.
   - **DoD:** a user with `prefers-reduced-motion: reduce` sees zero non-essential animation.

6. **Focus indicator tokens.**

   - Themes declare ring width, ring offset, ring color; focus is visible for keyboard users (#13).
   - **DoD:** keyboard-only navigation shows a visible focus ring on every interactive element.

7. **Forced-colors mode.**

   - Tokens resolve to user-agent values (`Canvas`, `CanvasText`, `LinkText`, `ButtonText`).
   - Exposes `color.system.canvas*` aliases.
   - **DoD:** a Windows High Contrast viewer sees the user-agent palette.

8. **Decorative vs semantic distinction.**

   - Tokens tagged `role: decorative` are not contrast-checked.
   - **DoD:** decorative tokens never block on contrast.

9. **Audit run cost budget.**
   - Full deck contrast audit on 500 slides must complete in < 200 ms.
   - **DoD:** benchmark < 200 ms p95; throttle on larger decks.

### 4.8 WS-THEME-8 — Theme marketplace & live demo renderer

**Tasks:**

1. **Marketplace listing schema (shared with P06).**

   - Theme listing is a bundle of `brand_kit_draft` + ≥ 1 `theme` + asset licenses (fonts, logos).
   - **DoD:** listing schema reused from P06; theme-specific fields added.

2. **Canonical sample deck (`packages/sample-deck/`).**

   - 12-slide sample deck schema baked into the marketplace; OSS.
   - Slides: title, agenda, KPI card, chart stub, section divider, comparison table, image+text, timeline, team, financials, outro, appendix.
   - **DoD:** sample deck versioned; marketplace tracks regressions to it.

3. **Live demo renderer (`apps/theme-marketplace-demo/`).**

   - Server-side renders the sample deck in the listing's theme.
   - Sandboxed iframe: no user data access; no network calls back to user tokens.
   - Interactive shell: slide picker, dark/light toggle, 3 sample components (KPI card, section divider, chart stub).
   - Demo state persists in URL hash (e.g., `#slide=4&mode=dark`).
   - **DoD:** all 12 sample slides render; URL hash round-trips.

4. **Content-hash verification on install.**

   - Theme bundle published file must match the seller's submitted hash.
   - Drift breaks install with a clear error.
   - **DoD:** tampered bundle rejected at install.

5. **License bundle enforcement at install time.**

   - Per-asset licenses (fonts, logos) are stored with the bundle; install validates each license's applicability to the installing org.
   - **DoD:** a bundle with a restricted-license font requires admin scope to install; admin override logged.

6. **Install flow into a brand-kit draft.**

   - Marketplace themes install into a brand kit draft; never auto-apply to existing decks.
   - **DoD:** install produces a draft kit; user explicitly applies to a deck.

7. **A11y certification gate.**

   - Listings with deeply broken themes cannot pass a11y certification for "featured" surfacing.
   - **DoD:** featured listing requires `a11y_certified` flag; broken themes flagged.

8. **Reviews + buyer-applied samples (opt-in).**
   - Star ratings + thumbnail grid of buyer-applied samples (anonymized, opt-in).
   - **DoD:** reviews UI ships; sample grid renders when opt-in samples exist.

### 4.9 WS-THEME-9 — Style lint

**Tasks:**

1. **Lint engine (`services/lint/`).**

   - Two-pass: (1) collect literal values across the scene graph, (2) bucket each into `on-brand`, `near-brand` (ΔE ≤ 5 in OKLCH or within style tolerance for fonts), or `off-brand`.
   - Severity: `BLOCK` (off-brand in a locked region), `WARN` (off-brand in editable regions), `INFO` (deprecated token, near-token).
   - **DoD:** lint on 200-slide deck < 1 s p95.

2. **One-click fix proposer.**

   - Color → nearest by ΔE in OKLCH or by role ("this looks like a `positive` color").
   - Font → same family slug if available, else closest style-metric.
   - **DoD:** fix applies to all selected findings in one transaction; undoable.

3. **Lint exclusions.**

   - Excludes: brand-locked regions (#36), per-slide override-token values (#47), explicit "ignore lint" annotation per element.
   - **DoD:** findings page groups by token so the user can see all 14 slides using `#34D399` and bulk-replace with `color.brand.positive`.

4. **Animated element evaluation.**

   - Animated elements have their end-state tokens evaluated, not transient keyframes.
   - **DoD:** a mid-animation element's end-state color is linted correctly.

5. **Chart palette identifiability check.**

   - Even if individual chart colors are on-brand, the palette as a whole may fail identifiability under CVD simulation (#44).
   - Triggers a CV-unsafety finding.
   - **DoD:** chart palettes failing identifiability under deuteranopia/protanopia/tritanopia are flagged.

6. **CI mode for lint.**
   - Lint runs as part of "export for review" pipeline (#180) and pre-merge in the deck-version approval workflow (#183).
   - **DoD:** pre-merge CI gate fails the build on BLOCK findings.

### 4.10 WS-THEME-10 — Brand-aware MCP tools (P13 hooks)

**Tasks:**

1. **`apply_theme` MCP tool (#221).**

   - Wraps `theme_service.apply()`; carries `brandContextId` scope; respects agent permissions (#225).
   - **DoD:** an agent with `brand.setActive` on Brand A cannot apply Brand B's theme.

2. **`token.audit_a11y` MCP tool.**

   - Returns a structured list of WCAG / CVD / motion-reduced violations.
   - **DoD:** agent receives audit JSON with severity, location, suggested fix.

3. **`theme.suggest_palette` MCP tool (preview).**

   - Returns a CVD-safe palette proposal preserving hue-spacing ≥ 30° in OKLCH.
   - **DoD:** proposal applies in one MCP call; user can revert.

4. **Brand-context-scoped permissions.**
   - Agents get a permission set restricted to a single brand context (#225); reduces blast radius.
   - **DoD:** brand-scoped token cannot write to another brand's tokens.

---

## 5. Architecture & Data

### 5.1 Postgres tables

| Table                     | Key fields                                                                                                                                                                                                  | Purpose                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `design_token`            | `token_id`, `group`, `name`, `type`, `value`, `description`, `tags`, `deprecated`, `created_by`, `created_at`                                                                                               | Typed token registry    |
| `token_alias`             | `alias_token_id`, `target_token_id`                                                                                                                                                                         | Alias resolution edges  |
| `theme`                   | `theme_id`, `name`, `kind`, `parent_theme_id`, `brand_context_id`, `created_by`, `created_at`, `signature`                                                                                                  | Theme metadata          |
| `theme_version`           | `theme_id`, `version`, `tokens_resolved`, `signature`, `created_at`                                                                                                                                         | Immutable snapshots     |
| `theme_override`          | `override_id`, `scope`, `scope_id` (slide/section/etc.), `tokens_partial`, `condition_expr`, `created_by`, `created_at`                                                                                     | Per-scope overrides     |
| `theme_application_event` | `event_id`, `deck_id`, `from_theme_id`, `to_theme_id`, `tokens_changed_count`, `latency_ms`, `actor_id`, `created_at`                                                                                       | Apply telemetry         |
| `brand_kit`               | `kit_id`, `name`, `owner_org_id`, `scope`, `published_at`, `archived_at`, `signature`, `extraction_attestation_id`, `created_at`                                                                            | Brand kit metadata      |
| `brand_kit_logo`          | `logo_id`, `kit_id`, `variant` (light/dark/mono), `size`, `format`, `asset_url`, `content_hash`, `clear_space_px`                                                                                           | Logos                   |
| `brand_kit_palette`       | `palette_id`, `kit_id`, `token_ids[]`, `cv_safe`, `hue_spacing_deg`                                                                                                                                         | Color palettes          |
| `brand_kit_font`          | `font_id`, `kit_id`, `font_asset_id`, `license_status`, `glyph_coverage` (jsonb), `axes` (jsonb)                                                                                                            | Fonts                   |
| `brand_kit_imagery_rule`  | `rule_id`, `kit_id`, `do_rules`, `dont_rules`, `min_resolution`, `subject_safe_zone`, `allowed_sources`                                                                                                     | Imagery rules           |
| `brand_kit_sub_brand`     | `parent_kit_id`, `child_kit_id`, `inheritance_type`                                                                                                                                                         | Sub-brand relationships |
| `brand_kit_archive`       | `kit_id`, `archived_at`, `reason`                                                                                                                                                                           | Archive trail           |
| `brand_context`           | `context_id`, `org_id`, `name`, `active_kit_id`, `archived_at`                                                                                                                                              | Multi-brand contexts    |
| `brand_extraction_job`    | `job_id`, `org_id`, `url`, `status`, `stages` (jsonb), `attribution` (jsonb), `confidence_scores` (jsonb), `result` (jsonb), `error_code`, `created_at`, `completed_at`                                     | Extraction telemetry    |
| `font_asset`              | `font_id`, `kit_id`, `file_url`, `format`, `weight`, `subset`, `glyph_coverage` (jsonb), `axes` (jsonb), `sha256`, `license_status`, `license_url`, `license_expires_at`, `anti_piracy_score`, `created_at` | Font assets             |
| `audit_brand_event`       | `event_id`, `org_id`, `kit_id`, `actor_id`, `action`, `payload` (jsonb), `created_at`                                                                                                                       | Append-only audit       |

Row-Level Security is enabled per `tenant_id` and `org_id`. The `audit_brand_event` table is **append-only** (no UPDATE/DELETE grants for non-admin roles).

### 5.2 Caching

- Leaf token values cached in-memory per scope (`L1`); Redis cache (`L2`) for cross-instance resolution; CDN edge for resolved CSS custom-property bundles per deck.
- Theme application diff cache: `theme_application_diff[from_theme_id][to_theme_id][deck_id_hash]` → pre-computed op batch; reused across sessions.

### 5.3 Services

- **`theme-service`** (TypeScript/Node 22 + Hono) — token resolution, theme apply, override CRUD, audit query, marketplace install.
- **`brand-service`** (TypeScript/Node 22 + Hono) — brand kit CRUD, multi-brand context, sub-brand inheritance.
- **`brand-extract-worker`** (TypeScript; HTTP-fetch + headless browser opt-in) — extraction pipeline.
- **`theme-pair-worker`** (TypeScript) — dark/light generator.
- **`font-service`** (TypeScript/Node 22 + Hono) — upload, license inference, glyph coverage, CDN serving.
- **`accessibility-audit-worker`** (TypeScript) — WCAG, APCA, CVD simulation.
- **`lint-service`** (TypeScript) — two-pass lint engine.

### 5.4 Events (NATS JetStream subjects)

- `theme.tokens_changed` — token value mutation.
- `theme.applied` — deck-level theme apply.
- `theme.overrides_set` — per-scope override.
- `brand.kit.published` / `brand.kit.archived` / `brand.kit.forked`.
- `brand.extraction.completed` / `brand.extraction.failed`.
- `font.uploaded` / `font.license.expiring`.
- `lint.run.completed` (downstream consumer for #180 / #183 / #237).
- `marketplace.theme.installed` (downstream for P19 storefront + P20 audit).

### 5.5 Protobuf / OpenAPI

- `contracts/proto/domio/v1/theme.proto` — Theme, ThemeVersion, TokenResolveRequest, TokenResolveResponse, ThemeApplyRequest, ThemeApplyResponse, ThemeOverrideSpec.
- `contracts/proto/domio/v1/brand.proto` — BrandKit, BrandContext, BrandExtractionJob, BrandExtractionAttestation.
- `contracts/proto/domio/v1/font.proto` — FontAsset, FontLicenseStatus, GlyphCoverage.
- `contracts/proto/domio/v1/lint.proto` — LintFinding, LintSeverity, LintFixProposal.
- `contracts/openapi/v1/theme.yaml` / `brand.yaml` / `font.yaml` / `lint.yaml` — external REST.
- `contracts/schema/design-token-v1.schema.json` — token JSON-Schema.
- `contracts/schema/brand-kit-v1.schema.json` — brand-kit JSON-Schema.
- `contracts/schema/font-asset-v1.schema.json` — font-asset JSON-Schema.

### 5.6 Performance budgets

- Token resolution (single token): < 1 ms p95.
- Batch token resolution (200 tokens): < 5 ms p95.
- Theme apply on 200-slide deck: < 300 ms p95.
- Token edit propagation on 500-slide deck: < 100 ms p95.
- Brand extraction end-to-end: median 15 s, p95 60 s.
- Font CDN first request (per subset): < 2 s; subsequent < 50 ms.
- WCAG audit on 500-slide deck: < 200 ms p95.
- Lint on 200-slide deck: < 1 s p95.
- Live demo render: < 800 ms p95 per slide.

---

## 6. Verification

|   # | Feature                    | Test / check                                                     | Expected result                                                          | Owner                       |
| --: | -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------- |
|  37 | Token registry             | AJV validation of 50 hand-authored tokens across 8 groups        | All pass                                                                 | Theme lead                  |
|  37 | Alias cycle                | Save `A → B → A`                                                 | `409 TOKEN_ALIAS_CYCLE`                                                  | Theme lead                  |
|  37 | Token deletion blocker     | Delete `color.brand.primary` while 14 elements reference it      | `409 TOKEN_REFERENCED` with referrer list                                | Theme lead                  |
|  38 | Theme apply                | Apply a new theme to a 200-slide deck                            | < 300 ms p95; layout geometry preserved                                  | Theme lead                  |
|  38 | Undo                       | One `Cmd-Z` after apply                                          | Full revert; one history entry                                           | Editor lead                 |
|  39 | Brand kit immutability     | Edit a published kit                                             | Rejected; fork-to-draft required                                         | Brand lead                  |
|  40 | Brand extraction           | Submit a marketing URL                                           | Median 15 s; p95 60 s; draft kit produced                                | Extract worker lead         |
|  40 | Robots honoring            | Submit URL disallowed by `robots.txt`                            | `BRAND_EXTRACT_ROBOTS_BLOCKED`                                           | Security + Extract lead     |
|  40 | Rate limit                 | 2 extractions of same URL within 5 min                           | Second rejected with rate-limit error                                    | Security + Extract lead     |
|  40 | Attribution                | Every extraction row                                             | `attribution` block present                                              | Security + Extract lead     |
|  41 | Multi-brand                | Workspace with 3 brand contexts                                  | Active context switchable per deck; cross-brand reuse audited            | Brand lead                  |
|  42 | Font license               | Upload an OFL font                                               | Status `permissive`; license URL captured                                | Font lead                   |
|  42 | Glyph coverage             | Upload a Latin-only font; deck uses Bangla                       | Warning; CJK/Bengali fallback chain engages                              | Font lead                   |
|  43 | Dark/light pair            | Generate Dark from Light with brand identity test                | Hue ±10°, chroma ±10 %; all token categories present                     | Theme lead                  |
|  44 | WCAG audit                 | Save token with 3:1 contrast on body text                        | BLOCK; cannot save without admin override                                | A11y lead                   |
|  44 | CVD simulation             | Palette flagged CV-unsafe                                        | Suggestion with hue-spacing ≥ 30° in OKLCH                               | A11y lead                   |
|  44 | Reduced motion             | Viewer with `prefers-reduced-motion: reduce`                     | Zero non-essential animation                                             | A11y lead                   |
|  45 | Live demo                  | Open a listing                                                   | 12 sample slides render in iframe; URL hash round-trips                  | Marketplace lead            |
|  45 | Install hash verify        | Tamper with bundle                                               | Install fails with clear error                                           | Security + Marketplace lead |
|  46 | Lint                       | Run lint on 200-slide deck                                       | < 1 s p95; findings grouped by token                                     | Lint lead                   |
|  46 | One-click fix              | Apply fix to 14 off-brand findings                               | All replaced in one transaction; undoable                                | Lint lead                   |
|  47 | Per-slide override         | Override `color.brand.primary` on slide 4                        | Chip "3 token overrides" on thumbnail; inheritance inspector shows chain | Editor lead                 |
|  47 | State-conditional override | Set `#100 variable = -1`; slide re-themes to negative variant    | Override applies when condition true                                     | Editor + Prototype lead     |
|  47 | Override survives swap     | Override `color.brand.primary` on slide 4; apply different theme | Override relative to new active theme                                    | Editor lead                 |
| 225 | Agent brand scope          | Agent with Brand A scope applies Brand B theme                   | Rejected with `403 BRAND_SCOPE_VIOLATION`                                | AI/Agents lead              |
| 196 | Audit                      | Modify a published brand kit                                     | `audit_brand_event` row written                                          | Security lead               |
|   – | Security gate              | All services pass `/docs/07-security-planning.md` checks         | Sign-off                                                                 | Security lead               |

### 6.1 Automated checks

- AJV gate in `contracts/` (CI).
- Buf breaking-change check (CI) on every `*.proto` change.
- Unit tests (`vitest` for TS, `go test` for Go, `pytest` for Python) — 95 % coverage on `theme-service`, `brand-service`, `lint-service`, `brand-extract-worker`, `theme-pair-worker`, `accessibility-audit-worker`.
- Property tests for `resolve()` (any precedence chain converges).
- Integration tests for theme apply CRDT transaction generation.
- E2E test for the full brand-extraction pipeline (recorded fixture URL).
- Visual regression on theme marketplace live demos (Playwright + screenshot diff).
- Performance benchmarks in `bench/` run nightly.

---

## 7. Risks & Open Decisions

| ID    | Risk                                                           | Likelihood | Impact | Mitigation                                                                                                    |
| ----- | -------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| TH-01 | Colorblind-safe palette suggestion discards brand identity.    | M          | M      | Suggestion is previewable before apply; user can revert; brand identity score surfaced in suggestion.         |
| TH-02 | Brand extraction blocks legitimate orgs (WAF / captcha walls). | M          | M      | Manual entry CTA + retry with headless browser opt-in; error hints explain workarounds.                       |
| TH-03 | Anti-piracy heuristics produce false positives.                | M          | M      | Admin override with audit log; heuristics reviewed quarterly; false-positive rate tracked.                    |
| TH-04 | OKLCH hue preservation fails for high-chroma brand colors.     | M          | M      | Detect and lower chroma with a "hue-preserved with chroma adjustment" notice; user can override.              |
| TH-05 | Live demo iframe leaks user data via fingerprinting.           | L          | H      | Sandbox isolates storage and cookies; CSP `frame-ancestors` strict; no network calls to user-token endpoints. |
| TH-06 | Theme apply generates huge CRDT transactions on large decks.   | L          | M      | Diff engine pre-computes op batch; throttle per-stream; benchmark on 1 k-slide deck.                          |
| TH-07 | Forced-colors mode authoring UX deferred too long.             | L          | M      | P22 polish phase owns it; tokens resolve correctly even without authoring UI.                                 |

### Open decisions

| ID       | Decision                                                                                         | Owner              | Deadline   |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------ | ---------- |
| OD-TH-01 | Whether to ship the brand-extraction worker with a headless-browser default for enterprise orgs. | Security + Product | Before M3  |
| OD-TH-02 | Use APCA Lc 60 or Lc 75 for `prefers-contrast: more` threshold.                                  | A11y lead          | Before M3  |
| OD-TH-03 | Marketplace theme revenue share rate (initial).                                                  | Product + Finance  | Before P19 |

---

## 8. Demo

A 25-minute internal demo proving the phase is done in an internal environment:

1. **Token registry.** Open Brand Kit → Tokens tab. Create `color.brand.primary`, `color.brand.secondary`, `typography.heading.fontFamily`, `spacing.layout.gutter`. Show the typed picker with OKLCH sliders; show WCAG audit on save; show alias `color.bg.surface → color.brand.primary`.
2. **Theme swap.** Apply `themeA` to a 200-slide deck; show < 300 ms timing. Apply `themeB`; show one `Cmd-Z` reverts atomically. Show locked region stayed untouched.
3. **Brand kit.** Create a brand kit with logos (light/dark/mono), a starter palette, and a starter type system. Publish; show immutability; fork to draft and edit.
4. **Brand extraction.** Paste a marketing URL; show the 5-stage progress card (Fetch → Analyze → Detect → Cluster → Propose). Side-by-side: source URL + sample deck using extracted tokens. Show `attribution` block; show that publish is blocked without `extractionAttestation`.
5. **Multi-brand.** Show a workspace with 3 brand contexts; switch active context per deck; show cross-brand asset reuse audit row.
6. **Custom fonts.** Upload an OFL font; show `permissive` status and license URL. Upload a Latin-only font; deck uses Bangla → show coverage warning and CJK/Bengali fallback chain.
7. **Dark/light pair.** Generate Dark from Light; show hue-preserved chips on semantic colors; show multi-step surface scale. Toggle `prefers-color-scheme`; show auto-swap.
8. **Accessibility.** Save a 3:1 contrast token → BLOCK with admin override. Run CVD simulation on a chart palette → suggestion with hue-spacing ≥ 30°. Set `prefers-reduced-motion: reduce` → animation suppressed.
9. **Marketplace live demo.** Open a theme listing; show 12 sample slides; toggle dark/light; URL hash updates.
10. **Style lint.** Run lint on a 200-slide deck with 14 off-brand findings; group by token; one-click fix to `color.brand.positive`; verify clean re-lint.
11. **Per-slide override.** Override `color.brand.primary` on slide 4; show chip "3 token overrides"; show inheritance inspector; swap theme; show override survives.
12. **State-conditional override.** Set variable `#100 = -1`; slide re-themes to negative variant; set `#100 = 1`; revert.
13. **MCP hook.** An agent with Brand A scope attempts to apply Brand B's theme → rejected with `403 BRAND_SCOPE_VIOLATION`.

---

## 9. Definition of Done

- [ ] All 11 features (#37–#47) implemented per the §6 verification matrix.
- [ ] Code merged to trunk with Conventional Commits.
- [ ] `theme-service`, `brand-service`, `brand-extract-worker`, `theme-pair-worker`, `font-service`, `accessibility-audit-worker`, `lint-service` all ship behind feature flags with default `off`.
- [ ] Protobuf / OpenAPI / JSON-Schema contracts committed; generated TS/Go clients committed; Buf breaking-change gate green.
- [ ] Postgres tables created via migration; RLS policies applied; `audit_brand_event` is append-only.
- [ ] Unit, property, integration, E2E, visual, performance, security, and accessibility tests pass.
- [ ] Telemetry: `theme.applied`, `theme.overrides_set`, `brand.extraction.completed`, `font.uploaded`, `lint.run.completed` events emitted; Prometheus histograms populated; dashboards wired.
- [ ] Threat model updated with brand-extraction scraping safeguards and font anti-piracy heuristics.
- [ ] Domain doc `/docs/theming-branding.md` updated to reflect any schema or behavior changes.
- [ ] Security gate from `/docs/07-security-planning.md` signed off (scraping policy, attribution immutability, font license tracking).
- [ ] Performance benchmarks green: token resolution < 5 ms batch, theme apply < 300 ms, lint < 1 s, WCAG audit < 200 ms.
- [ ] Internal demo passed end-to-end in the staging environment.
- [ ] Feature flags have an owner and an expiry date.
- [ ] One-paragraph release note added to `/docs/release-notes/`.

_End of phase-07-theming-brand-design-tokens.md._
