# Section 3 — Theming, Branding & Design Systems (Features 37–47)

> **Scope:** This document is the deep technical plan for the design-system substrate that every other section renders onto. It covers the design token registry, theme engine (resolution, inheritance, application), brand kits, brand extraction from URLs, multi-brand support, custom font upload and licensing, automatic dark/light generation, accessibility-aware theming (WCAG + colorblind safety), the theme marketplace, style linting, and per-slide theme overrides. The contracts defined here are load-bearing: every component (#23–36), every chart (#48–64), every smart component prop (#25), every AI redesign (#112), and every agent edit (#221–236) ultimately resolves to a token at some level in the inheritance chain described in §4.

> **Cross-section strategy:** Theming is _not_ an applied paint at the end of the pipeline — it is the resolution layer between authored intent ("use the accent color") and concrete rendered values (`#1F6FEB`). When any subsystem needs to know what color, font, spacing, or radius to render, it calls the **theme engine** and gets back a resolved value. This document defines that engine.

---

## 1. Feature-by-Feature Mapping

Each feature below is annotated with: a short **intent** statement, **acceptance criteria** (testable), **behavioral details / edge cases**, and **dependencies** on other features (internal to this section and external to later sections).

### Feature 37 — Design Token System

- **Intent:** Define colors, type scale, spacing, radii, shadows, motion, and content tokens once and propagate them through the entire deck so a single token edit re-renders every dependent element. This is the load-bearing primitive that features #38, #43, #46, #47, and the entire component ecosystem (#23–36) ride on.
- **Acceptance criteria**
  - Tokens are organized into typed **groups**: `color`, `typography`, `spacing`, `radius`, `shadow`, `motion`, `content`, `border`.
  - Each token has a **stable string ID** (`color.brand.primary`, `typography.heading.xl.size`, `spacing.layout.gutter`), a **type**, a **value schema**, and an optional **description / semantic meaning**.
  - Resolving any token by ID from any subsystem (editor, chart, AI assistant, agent) returns the same effective value given the same scope.
  - Editing a single token value, then pushing that edit, updates every dependent slide within 100 ms for decks up to 500 slides (see §8 performance).
  - Tokens validate against a JSON-Schema-declared schema; invalid token edits are rejected at write time, not render time.
  - Tokens support **aliases** (`color.bg.surface` → `color.brand.primary`); aliases resolve recursively and cycle detection prevents infinite loops.
- **Behavioral details / edge cases**
  - Tokens are stored as a **flat registry** (`tokenId → tokenDefinition`) keyed by ID, but grouped in the editor UI for discoverability (`Group.color.brand.{primary,secondary,tertiary,onPrimary}`).
  - Token values are **typed discriminated unions**:
    - `color`: `{ space: 'srgb'|'p3', channels: number[], alpha: number }` (Hex `oklch` and `srgb`)
    - `dimension`: `{ value: number, unit: 'px'|'rem'|'em'|'%' }`
    - `typography`: composed (`fontFamily`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `fallbackChain`)
    - `shadow`: composed (`offsetX`, `offsetY`, `blur`, `spread`, `color`)
    - `motion`: composed (`duration`, `easing`, `delay`)
    - `content`: raw string (e.g., `content.company.name`), specialized for text that is reused across the deck.
  - **Alias cycles** are detected at write time via DFS with memoized visited-set; attempting to save `A → B → A` returns `409 TOKEN_ALIAS_CYCLE`.
  - **Token deletion** that is referenced by an element, slide, theme, or override is blocked with a referrer list (`A is referenced by 14 slides, 2 themes`); the user is forced to either replace, unalias, or cancel.
  - **Deprecated tokens** are kept with a `deprecated: { replacedBy: '...', sinceVersion: '...' }` field so old brand kits keep working through a version migration.
- **Dependencies:** Provides raw material consumed by #38, #39, #41, #42, #43, #44, #45, #46, #47. Tightly coordinated with #14 (style copy/paste), #25 (smart component props resolve tokens), #48–#50 (auto-themed charts), #110 (data-to-story retrieves tokens), #112 (AI redesign is constrained by tokens), #194 (brand governance), #221 (MCP `apply_theme`).

### Feature 38 — One-Click Theme Swap

- **Intent:** Re-theme a whole deck without breaking layouts, by replacing the active **theme** (a named, versioned, immutable snapshot of resolved token values) rather than mutating individual elements.
- **Acceptance criteria**
  - Clicking "Apply theme X" on a 200-slide deck completes in under 300 ms (p95; see §8).
  - During swap, layout geometry (position, size, rotation, auto-layout refs) is preserved exactly. Only token-referenced properties (fill, stroke, font, radius, shadow, content) change.
  - The swap is recorded as a single history entry (#12 cross-section) so one `Undo` reverts the whole swap.
  - Live data bindings (#48) and animations are untouched; only their visual expressions of tokens change.
  - Themes are addressable by name, ID, or `themeMarketplaceListingId` and can be previewed before applying.
- **Behavioral details / edge cases**
  - Swap is implemented as a **transactional structural update**: the deck's `themeRef` pointer updates from `themeA` → `themeB`; CRDT ops for each node's token references are generated server-side via the diff engine.
  - If `themeB` lacks a token that some element references directly (e.g., an element referenced `color.brand.accentQuaternary` and `themeB` only defines 3 levels), the missing token **falls back** through the resolution chain (see §3 inheritance) and a `WARN_TOKEN_FALLBACK` warning is emitted.
  - **Per-slide theme overrides** (#47) survive a deck-level swap unchanged — overrides are in a separate layer that takes precedence over the deck theme.
  - **Brand-locked regions** (#36) are _not_ re-themed; swap functions against locked regions like a no-op for visual properties (layout geometry on a locked region is still preserved).
- **Dependencies:** #37 (tokens), #47 (overrides), #46 (lint post-swap warns on any missed token), #41 (multi-brand: swap can target a different brand's theme).

### Feature 39 — Brand Kit (logos, palettes, fonts, imagery rules)

- **Intent:** An **organization-level** (or **workspace-level**) bundle that consolidates a brand's identity: approved logos (light/dark/mono variants), color palettes, type system, image rules (do/don't, safe zones, allowed sources), and governance bindings (required fonts, required color tokens). Brand kits are the unit of multi-brand accounting (#41) and the destination for brand extraction (#40).
- **Acceptance criteria**
  - A brand kit has a name, owner, scope (org/workspace/team), logo assets in 3 variants (light/dark/mono) at minimum 4 sizes each, at least one color palette, at least one type system (a complete tokenized theme), and metadata (creation date, last modified, license refs).
  - Brand kits can be **published** to a workspace: members see them in a picker; non-admins cannot edit the canonical kit, only fork into a draft.
  - Multiple brand kits coexist within an org (multi-brand, #41); the active kit is set per deck or per brand-scope.
  - Brand-kit logos auto-link to token references like `asset.logo.primary` so a logo change renders throughout the deck.
  - Brand kits support **sub-brands** (a parent brand kit inheriting common tokens plus child overrides); this matches franchise/holding-company structures.
- **Behavioral details / edge cases**
  - Brand kits live in their own table (`brand_kit`) and reference themes (a brand kit may carry multiple themes: `theme.corporateLight`, `theme.corporateDark`, `theme.campaignQ3`).
  - Logo SVG processing: SVGs are sanitized (no remote scripts, no foreignObject), normalized for viewBox, and the brand kit metadata records the **source-of-truth URL** and a **content hash** for integrity.
  - **Imagery rules** are stored as a JSON document (`doRules`, `dontRules`, `minResolution`, `subjectSafeZonePolygon`, `allowedSources`), applied at upload time and at AI generation time (#114).
  - A brand kit is **immutable** in the published form; edits require forking into a draft and re-publishing. This makes published kits safe to reference from many decks.
  - **Logo clear-space** is enforced as a math constraint at insert time: a logo cannot be dropped closer than its declared `clearSpace` to the slide edge or other elements (unless an explicit "ignore safe zone" affordance is used, which is flagged by lint #46).
- **Dependencies:** #37, #40 (extraction produces a brand kit draft), #41 (multi-brand: kits are the multi-tenant unit), #42 (font assets live in the kit), #45 (kits feed marketplace listings), #194 (governance dashboard reads kits).

### Feature 40 — Brand Extraction from URL

- **Intent:** Paste a homepage URL; the system fetches, analyzes, and produces a draft brand kit (colors, fonts, logo, plus an inferred palette set and dark variant).
- **Acceptance criteria**
  - User pastes a URL; a job is queued (`brand_extraction_job`); within a documented budget (median 15 s, p95 60 s) the job returns a draft kit with: an extracted logo (light + dark best-effort), a 5–12-color palette ranked by frequency × saliency, 1–3 detected web fonts, a suggested typography scale, and a confidence score per field.
  - User can preview the assembled kit side-by-side against the source URL (split-screen viewer) and accept, edit, or discard fields independently.
  - Extraction is **idempotent** for the same URL — re-fetching yields the same content-hash; caches are reused.
  - **Copyright/licensing attribution**: the job emits an `attribution` block per extracted asset (logo source URL, font source license URL if detectable) and is stored in `brand_extraction_job.attribution`.
  - User must confirm an "I have rights to use this" attestation before the extracted kit can be published.
- **Behavioral details / edge cases**
  - **Pipeline stages**: (1) fetch (HTML) → (2) sanitize & strip tracking → (3) extract (a) `<link rel="icon">` / SVG / apple-touch-icon as logo candidates, (b) computed styles via headless browser snapshot for `color`, `background-color`, `font-family`, (c) `<meta>` OG image, (d) `@font-face` declarations and Google Fonts links for font detection → (4) cluster colors in OKLCH space → (5) score by frequency × saliency (filter out `transparent`, near-white, near-black background-only colors) → (6) detect fonts via a font-detection model and produce a candidate manifest → (7) package into a draft brand kit; user accepts/edits.
  - **Web-scraping safeguards**:
    - Honor `robots.txt` (default: respect; opt-in override per-org for owned domains).
    - Per-org rate limit: 1 extraction per URL per 5 minutes; 10 per hour per IP; 100 per day per workspace.
    - User-Agent: `Domio-BrandExtractor/1.0 (+contact-email)`; no cookies, no JS execution of third-party trackers.
    - **No double-hop fetching**: links inside the source page are _not_ followed; only the user-provided URL is fetched. CSS/JS resources needed for analysis are fetched from the same origin only.
    - **No PII capture**: page text is not stored; only assets and computed styles are.
    - **Dynamic rendering** is opt-in: a per-job toggle allows running in a headless browser; default is HTTP fetch + static HTML parsing.
  - **Logo extraction edge cases**: when multiple candidate logos exist (favicon, apple-touch, og:image, header SVG), pick the highest-resolution SVG/PNG ≥ 256 px, preferring SVG. Clearbit-style logo API fallback is **off by default**; admins can enable it for an org.
  - **Attribution & licensing**:
    - The job writes a non-repudiable `attribution` record: `{ sourceUrl, fetchedAt, contentHash, robotsHonored, licenseDetected? }`.
    - Detected Google Fonts links store the underlying `fonts.google.com` URL and license (all OFL by default) so downstream font installation (#42) can reuse those URLs.
    - User must accept a generated "brand usage rights" statement naming the extracted source before publishing; the kit's `extractionAttestation` field is timestamped and immutable thereafter.
  - **Failure modes**: URL unreachable, robots disallowed, page is JS-only with no static styling, blocked by WAF, captcha wall. Each returns a typed error code (`BRAND_EXTRACT_FETCH_FAILED`, `BRAND_EXTRACT_ROBOTS_BLOCKED`, `BRAND_EXTRACT_NO_STYLES_FOUND`, `BRAND_EXTRACT_WAF_BLOCKED`) with a human remediation hint.
- **Dependencies:** #39 (output is a brand kit draft), #42 (extracted fonts become font uploads with detected license), #43 (extraction proposes dark/light), #44 (palette is contrast-scored), #194 (governance).

### Feature 41 — Multi-Brand Support (agencies managing client brands)

- **Intent:** A single workspace can host multiple **brand contexts**, each with its own brand kit and tokens. Users select the active brand context per deck, per slide, or per element family.
- **Acceptance criteria**
  - A workspace has N brand contexts; each deck references exactly one "default" brand context, with overrides on a per-slide basis (#47).
  - Users with permission `brand.setActive` (org admin or brand-scope admin) can add, remove, fork, or archive a brand context.
  - Decks, components, and templates carry their **brand context of origin** so future "swap to brand B" works correctly even if the original brand is archived.
  - An agency user can see a tree view: `Workspace → Brand A → {themes: light, dark, campaign} + {assets: 42 logos} / Brand B → {themes: ...}`.
- **Behavioral details / edge cases**
  - A brand context is a **namespace root** for token IDs; the full resolution chain (org → brand → theme → override) is described in §3.
  - **Cross-brand asset reuse** requires explicit permission and is recorded in an audit log: "Alice used Brand A's logo `logo.primary` in Brand B's deck slide 4 — recorded per §7."
  - Archived brand contexts are immutable and hidden from pickers, but extant decks referencing them still resolve via archived-context table.
  - Brand-context-scoped agents (#225) get a permission set restricted to a single brand context, reducing blast radius for AI agents.
- **Dependencies:** #39, #40, #47, #225 (agent-scoped permissions), #194.

### Feature 42 — Custom Font Upload with Automatic Fallback and Licensing Checks

- **Intent:** Users upload commercial, open-source, or custom brand fonts once and reference them as tokens (`typography.heading.fontFamily`). The system validates licensing, tracks license terms, and constructs per-platform fallback chains.
- **Acceptance criteria**
  - User uploads `.woff2` (preferred), `.woff`, `.otf`, `.ttf`, or `.ttc` files (single weight = single file; variable font = single file).
  - System computes **license status** (`permissive`, `restricted`, `unknown`) based on an embedded `name` table scan + a license file detection (file with stem matching font filename: `MyFont-LICENSE.txt`).
  - **Fallback chain** auto-generated: user's fonts → style-matched platform fonts → generic `sans-serif`/`serif`. Matches Microsoft, Apple, Google, and Domio bundled fonts.
  - **Glyph coverage** is reported per upload per Unicode block; if coverage is incomplete for the deck's content locale (CJK, Arabic, Bangla per §12.4 of the planning guide, Cyrillic, etc.) the user is warned, and the fallback chain takes precedence for missing glyphs.
  - **License expiry**: tracked when a license has a known expiration (rare, e.g., enterprise contracts); warnings emitted 30/7/1 days before expiry.
  - **Restricted-license fonts** are flagged in the brand-kit UI; admins can publish kits containing restricted fonts but must confirm exposure scope (legal team approval gate, optional org setting).
- **Behavioral details / edge cases**
  - Fonts are served from a CDN-backed store (`font_asset`) with deterministic URLs (`/fonts/{fontId}/{weight}/{subset}.woff2`); subsetting is computed lazily (Latin / Latin-Ext / Cyrillic / Greek / CJK / Bengali etc.) on first request and cached.
  - **Variable fonts**: weight axis, width axis, slant axis are detected from the font's `fvar` table; tokens can specify axes explicitly (`typography.heading.weight=600`).
  - **Upload limits**: 25 MB per file, 50 fonts per brand kit per default; org admins can raise limits.
  - **Duplicate detection**: SHA-256 of font file hashes identifies duplicates across the org; a user attempting to upload a duplicate sees the existing font asset.
  - **Anti-piracy checks**: system detects common "cracked" markers (industry heuristics) and refuses such uploads with a clear message — "this font appears to be derived from an unlicensed source." False positives are overridable by org admins with audit logging.
  - **Style-matched fallback** uses a `font-metrics.json` dataset bundled with the platform (open-source — fe-style-matcher-payload) and an internal **metric-mismatch warning** is surfaced when fallback fonts have > 5 % x-height or width difference, since this can break layouts.
- **Dependencies:** #39 (fonts live in brand kits), #37 (fonts referenced via `typography.*` tokens), #46 (off-brand fonts flagged), #45 (marketplace themes bundle fonts with licenses).

### Feature 43 — Dark/Light Deck Variants Generated Automatically

- **Intent:** From one source theme, generate a paired theme for the other end of the light/dark axis, preserving the _identity_ (hue & chroma, brand personality) rather than mechanically inverting brightness.
- **Acceptance criteria**
  - One-click "Generate Dark from Light" (or inverse) produces a paired theme with **all token categories** (color, shadow, motion) resolved.
  - Generated themes pass a **brand identity preservation test**: the OKLCH hue of each semantic color (`primary`, `accent`, etc.) is preserved within ±10°; chroma is preserved within ±10 %; only **lightness** is re-mapped per a perceptual rule.
  - User can preview the generated theme against the source side-by-side and accept, tweak, or regenerate.
  - Generated themes are first-class `theme` records: editable, versionable, lockable, market-placeable.
- **Behavioral details / edge cases**
  - **Generation rules**:
    - Colors: re-mapped in **OKLCH**. Lightness flips (e.g., `L=0.95 → L=0.18`), chroma reduced by 10–20 % to compensate for the Helmholtz-Kohlrausch effect (saturated colors appear brighter in dark mode), hue preserved.
    - **Surfaces** are not a single flip — they form a multi-step surface scale (`surface.base`, `surface.raised`, `surface.overlay`, `surface.inverse`) where each step has a defined delta in OKLCH lightness.
    - **Shadows**: shadow lightness is darkened; shadow opacity is typically reduced (dark UIs use subtle inner glow + outer shadow at lower opacity).
    - **Borders**: subtle contrast borders in light become subtler or replaced by tonal borders in dark.
    - **Content**: text colors swap on the surface scale; placeholder/muted colors shift toward neutral (less chroma).
    - **Imagery**: logos with explicit light/dark/mono variants (#39) auto-pick the right one; photographs are not auto-edited.
  - **Edge cases**:
    - Hue-preservation can fail for **highly chromatic brand colors** (e.g., pure yellow `#FFD700`) where a literal inverse is unreadable. Detection lowers chroma sufficiently while keeping the brand identity; user gets a "hue-preserved with chroma adjustment" notice.
    - **Custom dark token overrides** in the source are detected and not overwritten if user checks "preserve custom overrides."
    - **System media query** `prefers-color-scheme` is also exposed as a token output: a deck can render in either light or dark based on the viewer's OS preference.
- **Dependencies:** #37, #39, #44 (accessibility audit on the generated theme), #38 (swap now references both variants).

### Feature 44 — Accessibility-Aware Theming

- **Intent:** Themes are validated against WCAG contrast and tested for colorblind safety (deuteranopia, protanopia, tritanopia, plus simulated low vision).
- **Acceptance criteria**
  - Every **content/background pair** of tokens is WCAG contrast-checked on theme creation and on every token edit. The minimums: AA Normal text 4.5:1, AA Large text 3:1, AAA Normal 7:1, AAA Large 4.5:1, Non-text 3:1.
  - Failures emit a `BLOCK` (token edit cannot save if AA fails in production contexts) or `WARN` (lint soft-warning; e.g., decorative-only).
  - **Colorblind-safe palette suggestions**: when a token palette is flagged as CV-unsafe, the system proposes an alternative palette preserving hue-spacing ≥ 30° in OKLCH (validated against simulated deuteranopia/protanopia/tritanopia maps).
  - **Reduced-motion / reduced-transparency** profiles (users with `prefers-reduced-motion` or `prefers-reduced-transparency`) automatically strip excessive animation; tokens tagged `motion.reduced.*` resolve for these viewers.
  - **Focus indicator tokens** are first-class: themes declare ring width, ring offset, ring color so focus is visible for keyboard users (#13).
  - **Forced colors** mode (Windows High Contrast) is detected at render time and tokens resolve to the user-agent-provided palette.
- **Behavioral details / edge cases**
  - WCAG contrast formula uses **relative luminance** per W3C WCAG 2.x (sRGB linearization then `(0.2126·R + 0.7152·G + 0.0722·B)`); for `prefers-contrast: more` viewers, the formula uses APCA (WCAG 3 draft) at threshold >= Lc 60 for body text.
  - Colorblind simulation is done via established simulation matrices (Brettel/Vienot/Mollon for dichromacy; Machado for higher-cvd severity) **transformed in OKLCH** to preserve perceived lightness gradients.
  - **Decorative vs semantic** distinction: a token tagged `role: decorative` is not contrast-checked against backgrounds.
  - **Charts** (cross-section tie with #48–#64): palettes for data viz are checked for both **contrast** (between adjacent data series) and **identifiability** (each series is uniquely resolvable under CVD simulations).
  - **Force-colors / forced-colors** mode renders tokens with the user agent values (`Canvas`, `CanvasText`, `LinkText`, `ButtonText`, etc.); token registry exposes `color.system.canvas` and `color.system.canvasText` aliases.
  - **Audit run cost budget**: full deck contrast audit on 500 slides must complete < 200 ms (see §8).
- **Dependencies:** #37, #39, #43 (generated dark is also audited), #46 (lint surfaces violations), #122 (AI accessibility assistant), #123 (AI chart selection chooses CV-safe palettes).

### Feature 45 — Theme Marketplace with Previewable Live Demos

- **Intent:** A platform-public catalog of community-contributed themes (color sets, type systems, motion presets, bundled logo & imagery conventions) discoverable by industry, mood, or color family. Each listing has a live, interactive demo rendered against a generic placeholder deck — buyers can flip slides, swap dark/light, and see real component previews before purchase.
- **Acceptance criteria**
  - Listing pages show live demos: a sample 12-slide deck rendered in the theme, with an interactive shell (slide picker, dark/light toggle, 3 sample components — KPI card, section divider, data chart stub — to validate holistically).
  - Listings declare a **license** (per-component): a marketplace theme is a bundle of brand kit + 1+ themes + asset licenses; licenses are enforced at install time (see §7).
  - Creators can sell themes and earn a revenue share; revenue share rate, payout, and tax handling live in the marketplace service.
  - Marketplace themes are **content-hash verified** on download; the published file matches the seller's submitted hash. Drift breaks install with a clear error.
  - Marketplace themes install into a brand kit draft; they never auto-apply to existing decks.
- **Behavioral details / edge cases**
  - Live demo is rendered server-side from a **canonical sample deck schema** (a Figma-style "deck.example" baked into the marketplace) so all listings have apples-to-apples demos. The sample deck is OSS and the marketplace tracks regressions to it.
  - **Demo isolation**: demo renders run in a sandboxed iframe with no access to user data, no network calls back to user tokens; demo state persists in the URL hash so linking "slide 4 in dark mode" works.
  - **A11y of the demo itself**: the marketplace page itself is audited; listings with deeply broken themes cannot pass a11y certification for "featured" surfacing.
  - **Reviews**: star ratings + a thumbnail grid of buyer-applied samples (opt-in, anonymized).
- **Dependencies:** #37, #39, #41 (marketplace themes install into multi-brand contexts), #42 (bundled fonts are license-tracked), #46 (lint runs against marketplace themes on install), §7 (license audit).

### Feature 46 — Style Linting — Off-Brand Colors/Fonts with One-Click Fixes

- **Intent:** A deck-wide lint pass that flags every element using a color or font _not_ in the active brand kit's tokens, with batched one-click fixes (replace with the nearest brand token).
- **Acceptance criteria**
  - Lint run on a 200-slide deck completes in < 1 s p95.
  - Findings are bucketed by severity: `BLOCK` (off-brand in a locked region), `WARN` (off-brand in editable regions), `INFO` (deprecated token or near-token).
  - **One-click fix**: replace with the brand's nearest token (computed in OKLCH for colors; computed via font-metric/style match for fonts) and apply across all selected findings.
  - Lint excludes: brand-locked regions (#36), per-slide override-token values (#47, which are intentional), and explicit "ignore lint" annotation per element.
  - Findings page groups by token (so the user can see all 14 slides using `#34D399` and bulk-replace them with `color.brand.positive`).
- **Behavioral details / edge cases**
  - The lint engine is **two-pass**: (1) collect all literal values (hex, rgb, named colors, font names) used across the scene graph; (2) bucket each into `on-brand`, `near-brand` (within ΔE ≤ 5 in OKLCH or within style tolerance for fonts), or `off-brand`.
  - **Bulk-fix proposes** a transformation per finding: color → nearest by ΔE (or by role if a semantic intent is detectable — "this looks like a `positive` color"), font → same family slug if available, else closest style-metric.
  - **Edge cases**:
    - **Brand override map per group**: a finding can be converted via a "force to nearest of role" filter.
    - **Animated elements** have their end-state tokens evaluated, not transient keyframes.
    - **Charts** (#48–#64) have separate palette lint rules: even if individual chart colors are on-brand, the palette as a whole may fail identifiability under CVD simulation (#44) and trigger a CV-unsafety finding.
  - **CI mode**: lint runs as part of an "export for review" pipeline and as a pre-merge check in the deck-version approval workflow (#180, #183).
- **Dependencies:** #37, #39, #44, #36 (locked regions skip lint), #47 (overrides preserved), #180 (review workflow gate), #237 (deck linting for agents, section 16).

### Feature 47 — Per-Slide Theme Overrides with Inheritance Rules

- **Intent:** Lets a single deck use a base theme (or a base theme + brand context) while allowing one or more slides to diverge — e.g., an appendix using a "report" theme that emphasizes tables, or an exec-summary slide inverting contrast for a printed handout.
- **Acceptance criteria**
  - A `theme_override` is attached to one or more slides; it defines a partial-token set (only the tokens that differ; everything else inherits).
  - Inheritance order (top wins): **`per-slide override` > `deck theme` > `brand context theme` > `org default theme`** — fully described in §3.
  - Inheriting chain viewable in the editor (per slide, "this slide overrides 3 tokens: color.brand.primary → #ABC123, spacing.layout.gutter → 32px, content.company.tagline → 'new tagline'").
  - Overrides survive theme swaps (#38) — if you swap from `themeA` to `themeB`, the override is still relative to the new active theme.
  - Promoting an override to deck-level, or vice-versa, is a single click; bulk operations supported.
- **Behavioral details / edge cases**
  - Override records carry a **scope** (`slide`, `slide-range`, `section`, `auto-layout child set`, or `state-conditional`).
  - **State-conditional overrides** (a slide that re-themes when a `#57 scenario toggle` or `#100 variable` reaches a value) are first-class — required by deep cross-section scenarios like "this slide's negative variant uses red on dark instead of the brand's positive green."
  - **Override conflicts** in `#186 auto-updating shared slides`: the most-specific scope wins, then the most-recent edit; conflicts are surfaced in a diff dialog.
  - **Bulk editor**: select multiple slides → "override tokens on all" applies to selection; consistent overrides can be promoted to a shared scope (e.g., section-level).
- **Dependencies:** #37, #38, #41 (cross-brand overrides), #100 (variables), #57 (scenarios), #186 (shared slides).

---

## 2. UX Flows

These flows are the canonical paths users take; each names the screens involved and the system calls behind them. They are **observable entry points** for observability metrics (see §9).

### 2.1 Defining Design Tokens

1. User enters Brand Kit editor → Tokens tab → Create group `color.brand`.
2. User picks `Color`, names it `color.brand.primary`; color picker accepts hex, OKLCH sliders, eyedropper (#15), or screenshot-of-canvas eyedropper.
3. User enters description "primary CTA, link, focus ring"; tags `role: interactive`, `role: brand`.
4. User saves → token registration goes through validation pipeline: WCAG audit if `role: content` (`#44`), alias-cycle check (`#37`), schema validation; on success the token is appended to the brand kit and propagates to elements that reference it.

Edge cases: alias cycles show a live red indicator before save; WCAG-block fails save with a one-click "auto-suggest compliant" or "save anyway (will be linted)" option gated to admins.

### 2.2 Swapping a Theme

1. User clicks Theme in top bar → Picker renders thumbnails (light/dark/preview).
2. User previews with hover (no apply); deck renders in a sandboxed overlay pane while still showing the current theme in the actual editor.
3. User clicks "Apply" → confirm dialog ("This will update 200+ elements. Undoable.").
4. Engine produces a per-element color/font/radius diff in the same CRDT transaction (#21); effects render progressively (priority by viewport visibility).
5. Toast confirms with "Undo" affordance.

Edge cases: locked regions (#36) stay unchanged; lint (#46) auto-runs and surfaces warnings; per-slide overrides (#47) survive unchanged.

### 2.3 Running Brand Extraction from URL

1. User in Brand Kit dialog → "Generate from URL."
2. User pastes URL, optionally ticks "Include dynamic rendering," accepts TOS.
3. Job is queued (`brand_extraction_job`); the UI shows a progress card with stages: _Fetch → Analyze → Detect → Cluster → Propose_.
4. On completion, a draft kit appears with extracted fields: 7 colors (ranked), 2 fonts, 1 logo, plus a confidence score per field. A side-by-side viewer shows the source URL + a sample deck using extracted tokens.
5. User accepts fields individually (or all) → system writes `extractionAttestation` and the draft kit becomes a regular brand kit draft.

Edge cases: blocked by robots / WAF / captcha → typed error + retry / manual entry CTA.

### 2.4 Setting Up a Brand Kit from Scratch

1. Workspace admin → Settings → Brand Kits → Create.
2. Kit wizard: (a) Basics (name, scope), (b) Logos (upload light/dark/mono in vector & raster), (c) Type system (upload fonts or pick from marketplace), (d) Color tokens (start from a starter set or extracted kit or marketplace theme), (e) Optional imagery rules.
3. Each step validates: image min-resolution, font licenses, color WCAG against background defaults.
4. Preview in a sample deck before publishing; publish to the workspace when ready.

Edge cases: sub-brand inheritance is set up at creation time; legal approval gate (optional org setting) blocks publish without an approver click.

### 2.5 Configuring Dark/Light Variants

1. From an existing light theme in a brand kit → "Generate Dark Pair."
2. System runs generation pipeline (`#43`); preview rendered side-by-side.
3. User overrides any auto-generated token manually.
4. Save as a paired theme in the kit; both light and dark become available as themes to apply.

Edge cases: hue-preservation warning per high-chroma token; preserve-custom-overrides toggle.

### 2.6 Fixing Off-Brand Violations (Style Lint)

1. User opens Lint panel (or triggers via keyboard shortcut or CI job).
2. Findings grouped by severity and by token-target. Example: "Off-brand color — 14 occurrences — closest brand token: `color.brand.positive`."
3. User reviews; selects all 14 → "Apply fix" → diff preview against undo history → apply.
4. Re-lint auto-runs to verify clean state.

Edge cases: locked regions are excluded; chart palettes flagged separately (#44); user can demote a finding to `INFO` once with audit log.

### 2.7 Theme Overrides per Slide

1. User on a slide → right-click → "Override theme on this slide."
2. Token picker shows the active theme's tokens; user picks one to override (e.g., `color.brand.primary` → `#000000` for a black-accent slide).
3. Save → a small chip appears in the slide thumbnail indicating "3 token overrides."
4. Inheritance inspector shows the full chain.

Edge cases: promoting slide-level override to deck-level requires user confirmation (irreversible without manual revert).

---

## 3. Functional & Non-Functional Details

### 3.1 Token Resolution Algorithm

Token references are resolved by `resolve(tokenRef, scope, deckState)` with a deterministic order. The algorithm:

```text
1. If scope is 'per-slide' and override_registry[slide_id] contains
   an explicit value or alias for tokenRef, return it.
2. Else if scope is 'theme' and theme[tokenRef] resolves to a non-null
   value, return it.
3. Else if scope is 'brand' and brand_kit.theme.active[tokenRef]
   resolves, return it.
4. Else if scope is 'org' and org.default_theme[tokenRef] resolves,
   return it.
5. Else if tokenRef is an alias chain: resolve alias recursively with
   cycle detection; first concrete value wins.
6. Else if a system alias applies (prefers-color-scheme = dark →
   color.system.canvas; forced-colors mode → color.system.canvasText),
   return that.
7. Else return null AND emit a WARN_TOKEN_UNRESOLVED with referrer id.
```

Resolution is pure and synchronous — it never depends on network calls. All leaf token values are cached per scope in memory.

### 3.2 Inheritance Order (Org / Brand / Theme / Per-Slide)

The full cascade, top-of-stack wins:

```text
per-slide override → slide-section override → deck theme swap
  → brand kit (sub-brand overrides parent brand)
  → workspace brand context
  → org default theme
  → bundled platform default (DARK/LIGHT/HIGH_CONTRAST/FORCED_COLORS variants)
```

Key properties:

- **Aliases are resolved within their scope**. An alias referencing `color.brand.primary` from inside `deck theme` resolves to the _active_ brand context's primary — which means swapping brands re-points all aliases automatically. (#38 is therefore implemented as a brand swap underneath.)
- **Per-slide overrides survive deck theme swap**. The override is recorded as "this token differs from active theme by X" and re-resolves after swap.
- **State-conditional overrides** (e.g., for #57 scenarios) are evaluated at presentation time against the deck's runtime variable state.

### 3.3 Fallback Rules

When a token does not resolve, the fallback ladder is:

1. The same `tokenId` in the active fallback theme (light → dark switch resolves to the paired theme's tokens).
2. The same `tokenId` in the bundled `theme.platform.fallback` (this is built into the editor binary and survives offline).
3. A system-default literal — e.g., `color.brand.missing` resolves to `#888888` and a "missing token" lint banner appears in the editor.
4. A render-time error indicator (Z-shape pattern fill for shapes, ?-placeholder for text) so the user notices immediately.

### 3.4 Dark/Light Generation Rules

Generation is a token-by-token transform in OKLCH:

- **Hue**: preserved within ±10°. Higher chroma colors get chroma adjustments downward by 10–20 % in dark mode to compensate for the Helmholtz-Kohlrausch effect.
- **Lightness**: re-mapped via a piecewise perceptual curve (`light = f(light_source)` where `f` clamps `L > 0.95 → L = 0.18` and `L < 0.05 → L = 0.85`, with HCT-style smoothstep in between).
- **Surfaces**: explicit scale (`surface.base`, `surface.raised`, `surface.overlay`, `surface.inverse`) with hand-tuned delta steps.
- **Shadows**: in dark mode, shadow opacity is reduced (avg 0.10–0.20) and slight inner glow can replace outer shadow for elevation.
- **Text**: re-resolved against the surface scale; body text retains hue but lightness flips.
- **Brand color preservation test**: any generated token that drifts > 10° in hue OR > 20 % in chroma from the source is flagged for user review and is not auto-published.

### 3.5 Contrast Checking (WCAG Formulas)

Implemented as a pure function `contrast(foreground, background) → ratio`:

```text
For each sRGB channel c in [0,1]:
  c_lin = c <= 0.03928 ? c/12.92 : ((c + 0.055) / 1.055) ** 2.4
relative_luminance = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
contrast = (L_lighter + 0.05) / (L_darker + 0.05)
```

For P3 colors: linearize in P3 primaries (slightly different coefficients), then treat as `0.2126 * R_lin_p3 + 0.7152 * G_lin_p3 + 0.0722 * B_lin_p3`. Threshold logic per WCAG 2.x SC 1.4.3, 1.4.6, 1.4.11.

For users with `prefers-contrast: more`, the audit also runs the APCA algorithm (WCAG 3 draft) at threshold ≥ `Lc 60` (body), `Lc 75` (fluent body), `Lc 90` (preferred); findings are reported as `WARN` (prefer-more-fail) without blocking.

Colorblind simulations use established matrices and are run in **OKLCH** space so perceived lightness is preserved.

### 3.6 Colorblind-Safe Palette Generation

When a palette is detected as CV-unsafe (color pair confusable under deuteranopia/protanopia/tritanopia), the generator:

1. Re-seeds a palette from OKLCH hue steps, enforcing ≥ 30° hue spacing for primary tones.
2. Lightness-chroma tuned to create distinguishable loci under simulated maps.
3. Returns a candidate palette; user can lock one and re-run lint.

For data-vis, palettes are generated against a 12-color target with full pairwise simulation coverage.

### 3.7 Style Linting Rules

The lint ruleset is documented in-machine and machine-queryable:

| Rule ID                                 | Trigger                                                         | Severity                        | Fix Action                                                            |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `LINT_OFF_BRAND_COLOR`                  | element fill / stroke not within brand palette OR within ΔE ≤ 5 | BLOCK in locked, WARN elsewhere | replace with nearest by ΔE (or by semantic role)                      |
| `LINT_OFF_BRAND_FONT`                   | element `fontFamily` not in brand typography token set          | BLOCK in locked, WARN elsewhere | replace with style-metric-matched brand font                          |
| `LINT_DEPRECATED_TOKEN`                 | element references a token deprecated since version             | INFO                            | replace with `replacedBy`                                             |
| `LINT_CONTRAST_FAIL`                    | text contrast against background < AA                           | BLOCK                           | auto-suggest darker text or lighter bg (or `WARN` if decorative-only) |
| `LINT_FORCED_COLORS_UNSAFE`             | element that won't render correctly in forced-colors mode       | WARN                            | provide `color.system.*` fallbacks                                    |
| `LINT_CHART_PALETTE_UNSAFE`             | chart palette not identifiable under CVD simulation             | BLOCK                           | offer CV-safe replacement palette                                     |
| `LINT_FONT_LICENSE_EXPIRY`              | font license expires < 30 days                                  | WARN                            | prompt to renew or swap                                               |
| `LINT_LOGO_SAFE_ZONE_VIOLATION`         | logo closer to slide edge than declared `clearSpace`            | WARN                            | nudge to safe zone                                                    |
| `LINT_BRAND_LOCK_REGION_TOKEN_OVERRIDE` | token override inside a brand-locked region                     | BLOCK                           | strip override                                                        |
| `LINT_NEAR_BRAND_TOKEN`                 | element fill within ΔE ≤ 5 of brand palette but not aliased     | INFO                            | promote alias for consistency                                         |

A `WARN` becomes a `BLOCK` when (a) inside a brand-locked region (#36), (b) the deck is being exported for external sharing (#159), or (c) the org has enabled "strict brand governance."

---

## 4. Architecture

The system decomposes into the following services / modules. The boundary between _token resolution_ (must be ultra-fast, synchronous) and _brand administration_ (user-paced, can be async) is intentional.

```text
+---------------------+        +-----------------------+        +--------------------+
| Token Registry      |<------>| Theme Engine          |<------>| Brand Kit Service  |
| (read-heavy, fast)  |        | (resolution cache,    |        | (CRUD, publishing, |
| CRDT-published      |        |  inheritance rules)   |        |  sub-brand mgmt)   |
+---------------------+        +-----------------------+        +--------------------+
        ^                              ^   ^   ^                          ^
        |                              |   |   |                          |
        v                              v   |   |                          v
+---------------------+        +-----------------------+        +--------------------+
| Editor / Renderer   |        | Accessibility Auditor |        | Brand Extraction   |
| (canvas, charts,    |        | (contrast + CVD)      |        | Pipeline           |
|  components)        |        |                       |        | (URL → Kit draft)  |
+---------------------+        +-----------------------+        +--------------------+

+---------------------+        +-----------------------+        +--------------------+
| Font Service        |        | Theme Marketplace     |        | Style Linter       |
| (upload, license,   |        | (listings, demo       |        | (deck-wide scan,   |
|  subsetting,        |        |  render, payments)    |        |  bulk-fix engine)  |
|  fallback chain)    |        |                       |        |                    |
+---------------------+        +-----------------------+        +--------------------+
```

### 4.1 Token Registry

- Postgres-backed persistent storage + in-memory replica per org.
- Tokens are CRDT-published values (last-writer-wins per `(brandId, tokenId)` tuple); concurrent edits resolve by version vector.
- Public API is `resolve(tokenRef, scope)` returning a typed value and a metadata block (`source: 'override' | 'theme' | 'brand' | 'org' | 'platform-fallback' | 'system-alias'`).
- The editor binary ships a bundled fallback registry (`theme.platform.fallback`) so resolution works fully offline (#21).

### 4.2 Theme Engine (Resolution, Inheritance, Application)

- A thin deterministic library, no I/O at runtime.
- Caches resolutions per `(deckId, slideId, tokenRef)` in a TTL'd map (60 s) inside the editor process; the server uses the same cache key.
- Cache invalidates on any of: token edit, theme edit, brand kit edit, slide override change, deck theme swap.
- Application (render-side): renderer asks `getResolved(tokenRef)` for each property it paints; bulk-fetch APIs (`getResolvedMany([...])`) accelerate large scenes.

### 4.3 Brand Kit Service

- Owns brand_kit, sub-brand relations, publishing/forking, audit logs, license references.
- APIs: `createKit`, `forkKit`, `publishKit`, `archiveKit`, `attachFont`, `attachLogo`, `setActiveBrand(deckId, brandId)`.
- Org-level RBAC: `brand.kit.create`, `brand.kit.publish`, `brand.kit.archive`. Per-brand scopes can grant access to specific users.

### 4.4 Brand Extraction Pipeline

Components and orchestration:

- **Fetcher** (HTML GET, robots.txt honored, redirect-bounded, retry-with-backoff); for "dynamic rendering" toggled jobs, a headless-browser pool with per-job timeout.
- **Parser**: parses `<meta>`, `<link rel="icon">`, OG tags, `<style>` blocks (inline CSS only, no remote `@import` follow), `<link rel="stylesheet">` (same-origin only).
- **Asset extractor**: picks highest-res logo candidate; downloads SVG sanitization; PNG/JPG re-encodes to a canonical format.
- **Color extractor**: parses inline CSS + `<style>` blocks; computes computed styles via the headless DOM; clusters in OKLCH space; ranks by frequency × saliency.
- **Font detector**: matches against an internal font-detection model (vector of glyph features); wraps with a confidence score; proposes the closest fonts in our catalog if not exact-match.
- **Packager**: writes `brand_extraction_job` rows (`extractedColors`, `extractedFonts`, `extractedLogo`, `attribution`, `confidenceScores`).
- **Reviewer UI**: surface as draft kit; user accepts/edits; on save, an `extractionAttestation` is written with `confirmedBy` user id and a non-repudiable timestamp.

Safeguards and licensing handled per §2.3 and §7.

### 4.5 Font Service

- **Ingest**: file validation (file-type check via magic bytes; font validity via `opentype.js`-based parser check — must parse, must have valid `name` table), license-file detection (`MyFont-LICENSE.txt`, `OFL.txt`, `License.md`).
- **Storage**: object store with content-addressed URLs; per-org isolation; immutable once published.
- **Subset pipeline**: triggered on first request for an unseen Unicode range; cached subset bundles uploaded to CDN.
- **Fallback chain builder**: input is requested font + brand's locale list + deck's text-content locale set + a context hint (heading vs body); output is the chain.
- **License tracker**: every font_asset has zero or more font_license rows (a single font can have multiple permitted uses or expiry dates per font family + vendor).

### 4.6 Accessibility Auditor

- Pure-function library usable from CI, lint pass, theme preview, and at render-time for `prefers-contrast: more`.
- Functions: `contrast(fg,bg)`, `apcaContrast(fg,bg)`, `simulateCvd(color, kind)`, `paletteldentifiable(palette, cvdKinds)`.
- Outputs deterministic results — same inputs → same output, stable across versions.

### 4.7 Theme Marketplace

- Separate service from Brand Kit Service (different concerns: listings, payments, demo rendering).
- **Demo renderer**: server-side headless renderer that takes a theme listing + sample-deck schema and produces a streaming demo response (frame-by-frame, like a video but interactive via small JS postMessage shim).
- **Listing integrity**: each listing stores a content hash; download verifies; mismatch → install blocked.
- **License enforcement**: at install time, each bundled asset's license terms are checked against the target org's policy; failures require admin override with audit.

---

## 5. Data Model (Postgres + JSONB)

JSONB is used for **untyped metadata** and **human-authored content** (token descriptions, license terms blob, sample-deck customizations). Strongly-typed columns are used for everything that drives resolution, lint, or audit.

```sql
-- Token primitive; stored flat, grouped by ID prefixes
CREATE TABLE design_token (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id     uuid NOT NULL REFERENCES brand_kit(id) ON DELETE RESTRICT,
  token_id         text NOT NULL,                  -- e.g., 'color.brand.primary'
  token_group_id   uuid NOT NULL REFERENCES token_group(id),
  type             text NOT NULL CHECK (type IN
                       ('color','dimension','typography','shadow','motion','content','border')),
  value            jsonb NOT NULL,                 -- typed union per §1 #37
  aliases          text[] NOT NULL DEFAULT '{}',   -- explicit alias targets (recursive resolved)
  description      text,
  roles            text[] NOT NULL DEFAULT '{}',   -- ['interactive','brand','content','decorative']
  deprecated       jsonb,                          -- {replacedBy, sinceVersion}
  schema_version   int NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_kit_id, token_id)
);
CREATE INDEX idx_design_token_brand_kit ON design_token(brand_kit_id);
CREATE INDEX idx_design_token_token_id ON design_token(token_id);
CREATE INDEX idx_design_token_type      ON design_token(type);

CREATE TABLE token_group (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id uuid NOT NULL REFERENCES brand_kit(id) ON DELETE CASCADE,
  group_id    text NOT NULL,                       -- 'color.brand'
  parent_id   uuid REFERENCES token_group(id),
  description text,
  UNIQUE (brand_kit_id, group_id)
);

-- A named, versioned, immutable snapshot of resolved token values
CREATE TABLE theme (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id    uuid NOT NULL REFERENCES brand_kit(id) ON DELETE RESTRICT,
  parent_theme_id uuid REFERENCES theme(id),      -- for dark/light pairs
  name            text NOT NULL,
  axis            text NOT NULL CHECK (axis IN ('light','dark','hc','auto','custom')),
  companion_axis  text,                            -- 'dark' for light's pair
  resolved_tokens jsonb NOT NULL,                 -- full materialized token map
  description     text,
  version         int NOT NULL DEFAULT 1,
  is_published    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_kit_id, name, version)
);
CREATE INDEX idx_theme_brand_kit ON theme(brand_kit_id);

CREATE TABLE brand_kit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace(id),
  parent_kit_id uuid REFERENCES brand_kit(id),    -- sub-brand relationship
  name          text NOT NULL,
  description   text,
  scope         text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('org','workspace','team')),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  logos         jsonb NOT NULL DEFAULT '[]',      -- logo assets bundle
  imagery_rules jsonb,                            -- do/dont/safeZone/etc.
  governance    jsonb,                            -- required tokens, blocked tokens, etc.
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL REFERENCES app_user(id),
  metadata      jsonb
);
CREATE INDEX idx_brand_kit_workspace ON brand_kit(workspace_id);
CREATE INDEX idx_brand_kit_parent     ON brand_kit(parent_kit_id);
CREATE INDEX idx_brand_kit_status     ON brand_kit(status);

CREATE TABLE brand_extraction_job (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace(id),
  source_url      text NOT NULL,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN
                     ('queued','fetching','analyzing','detecting','clustering','proposing',
                      'completed','failed','blocked')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  error_code      text,
  -- Per-stage extracted artifacts
  extracted_colors jsonb,                         -- [{hex, oklch, roleConfidence, frequency, saliency}]
  extracted_fonts  jsonb,                         -- [{family, sourceUrl, licenseUrl, confidence}]
  extracted_logo   jsonb,                         -- {candidates, picked, pickerReason}
  attribution      jsonb,                         -- {sourceUrl, fetchedAt, contentHash, robotsHonored, licenseDetected}
  confidence_scores jsonb,                        -- {colors, fonts, logo} numerical
  draft_brand_kit_id uuid REFERENCES brand_kit(id),
  -- Audit
  requested_by     uuid NOT NULL REFERENCES app_user(id),
  robots_disallowed boolean NOT NULL DEFAULT false,
  request_ip_hash  text,
  rate_limit_key   text NOT NULL
);
CREATE INDEX idx_brand_extraction_workspace ON brand_extraction_job(workspace_id);
CREATE INDEX idx_brand_extraction_status    ON brand_extraction_job(status);

CREATE TABLE font_asset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id    uuid NOT NULL REFERENCES brand_kit(id) ON DELETE RESTRICT,
  family          text NOT NULL,
  source_format   text NOT NULL CHECK (source_format IN ('woff2','woff','otf','ttf','ttc','variable')),
  content_hash    text NOT NULL,                  -- SHA-256
  file_size_bytes bigint NOT NULL,
  is_variable     boolean NOT NULL DEFAULT false,
  axes            jsonb,                          -- for variable fonts
  glyph_coverage  jsonb,                          -- {latin, latinExt, cyrillic, greek, cjk, bengali, ...}
  uploaded_by     uuid NOT NULL REFERENCES app_user(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN
                     ('pending','validated','rejected')),
  rejection_reason text,
  UNIQUE (brand_kit_id, family, content_hash)
);
CREATE INDEX idx_font_asset_brand_kit ON font_asset(brand_kit_id);

CREATE TABLE font_license (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  font_asset_id       uuid NOT NULL REFERENCES font_asset(id) ON DELETE CASCADE,
  license_kind        text NOT NULL CHECK (license_kind IN
                         ('OFL','Apache-2.0','MIT','BSD','CC0','commercial','custom','unknown')),
  permissiveness      text NOT NULL CHECK (permissiveness IN
                         ('permissive','restricted','unknown')),
  license_text        text,
  license_url         text,
  vendor              text,
  expires_at          timestamptz,                 -- null = perpetual
  scope_restrictions  jsonb,                        -- e.g., {noBroadcast, printOnly, regional}
  confirmed_by        uuid REFERENCES app_user(id),
  confirmed_at        timestamptz,
  audit_log_id        uuid
);

CREATE TABLE color_palette (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id    uuid REFERENCES brand_kit(id),
  theme_id        uuid REFERENCES theme(id),
  name            text NOT NULL,
  source          text NOT NULL CHECK (source IN
                     ('manual','generated','extracted','marketplace')),
  swatches        jsonb NOT NULL,                  -- {name, hex, oklch, contrast: {againstSelf}}
  cvd_safe        boolean NOT NULL DEFAULT false,
  cvd_score       jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_color_palette_theme ON color_palette(theme_id);

CREATE TABLE accessibility_profile (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id        uuid REFERENCES theme(id) ON DELETE CASCADE,
  wcag_level      text NOT NULL CHECK (wcag_level IN ('A','AA','AAA')),
  audit_results   jsonb NOT NULL,                 -- [{tokenId, fg/bg, ratio, pass/fail, severity}]
  cvd_results     jsonb NOT NULL,                 -- palettes with pair distances per kind
  apca_results    jsonb,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_id, wcag_level)
);

CREATE TABLE theme_override (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         uuid NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
  scope_type      text NOT NULL CHECK (scope_type IN ('slide','slide_range','section','state_conditional')),
  scope_ref       text NOT NULL,                  -- 'slide:42' or 'state:scenario==bear'
  token_overrides jsonb NOT NULL,                 -- map of token_id -> value or alias
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES app_user(id),
  is_locked       boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_theme_override_deck    ON theme_override(deck_id);
CREATE INDEX idx_theme_override_scope   ON theme_override(scope_type, scope_ref);

CREATE TABLE theme_marketplace_listing (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id     uuid NOT NULL REFERENCES app_user(id),
  brand_kit_bundle    jsonb NOT NULL,             -- serialized brand kit + themes + assets
  demo_deck_ref       uuid REFERENCES deck(id),   -- canonical sample-deck instance
  content_hash        text NOT NULL,
  license_terms       jsonb NOT NULL,             -- commercial, attribution, etc.
  price_cents         int,
  revenue_share_bps   int NOT NULL,               -- basis points
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN
                         ('draft','under_review','published','rejected','retracted')),
  rating_avg          numeric(3,2),
  rating_count        int NOT NULL DEFAULT 0,
  listings_collections text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,
  UNIQUE (creator_user_id, content_hash)
);
CREATE INDEX idx_marketplace_status  ON theme_marketplace_listing(status);
CREATE INDEX idx_marketplace_creator ON theme_marketplace_listing(creator_user_id);

CREATE TABLE marketplace_purchase (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        uuid NOT NULL REFERENCES theme_marketplace_listing(id),
  buyer_workspace_id uuid NOT NULL REFERENCES workspace(id),
  buyer_user_id     uuid NOT NULL REFERENCES app_user(id),
  price_cents       int NOT NULL,
  revenue_share_bps int NOT NULL,
  installed_kit_id  uuid REFERENCES brand_kit(id),
  integrity_verified boolean NOT NULL,            -- content hash matched at install
  purchased_at      timestamptz NOT NULL DEFAULT now()
);
```

Key constraints:

- Tokens cannot be deleted while referenced (`ON DELETE RESTRICT` on `brand_kit` and a referential integrity check before any DELETE).
- `theme.resolved_tokens` is a fully **materialized** snapshot — switching themes is a pointer swap, not a re-resolution.
- `font_asset.content_hash` is unique per `(brand_kit, family)` to dedupe uploads.
- `theme_marketplace_listing.content_hash` is verified at install against `installed_kit_id`'s computed hash, recorded in `marketplace_purchase.integrity_verified`.

---

## 6. APIs & Contracts

All endpoints are REST/JSON unless marked otherwise. Auth: OAuth2 bearer; per-org tokens carry RBAC claims; agent tokens (#221–236) carry capability claims.

### 6.1 Token CRUD

```http
POST   /v1/brand-kits/{kitId}/tokens                  -- create
GET    /v1/brand-kits/{kitId}/tokens                  -- list (paged, filter by group)
GET    /v1/brand-kits/{kitId}/tokens/{tokenId}        -- get single
PATCH  /v1/brand-kits/{kitId}/tokens/{tokenId}        -- update value (validates schema + WCAG if role:content)
DELETE /v1/brand-kits/{kitId}/tokens/{tokenId}        -- 409 if referenced
POST   /v1/brand-kits/{kitId}/tokens:batch-validate   -- bulk (lint precheck for many edits)
GET    /v1/brand-kits/{kitId}/tokens:resolve?ids=...   -- server-side resolver (offline-safe)
```

```json
POST /v1/brand-kits/{kitId}/tokens request body
{
  "tokenId": "color.brand.primary",
  "type":    "color",
  "value":   { "space": "oklch", "channels": [0.62, 0.18, 240.0], "alpha": 1.0 },
  "aliases": ["color.interactive.primary"],
  "roles":   ["interactive","brand"],
  "description": "Primary CTA color, focus ring"
}
```

```json
200 OK response
{ "id": "<uuid>", "tokenId": "color.brand.primary", "version": 7, "validations": { "wcag": { "against": ["color.bg.surface","color.bg.raised","color.bg.overlay"], "results": [{"pair": "...","ratio": 4.92,"level": "AA"}] } } }
```

```json
409 TOKEN_ALIAS_CYCLE response
{ "code": "TOKEN_ALIAS_CYCLE", "message": "Cycle detected: color.a -> color.b -> color.a", "details": { "cycle": ["color.a","color.b"] } }
```

### 6.2 Theme Apply

```http
POST /v1/decks/{deckId}/theme:apply
{
  "themeId": "<uuid>",
  "previewOnly": false,
  "includeLockedRegions": false   // always false; locked regions are never re-themed
}
```

Response: `200 { "appliedAt": "<ts>", "tokenDiffCount": 142, "durationMs": 287, "warnings": [...] }`.
Idempotency: `Idempotency-Key` header; repeats within 60 s return same response.

### 6.3 Brand Extraction Submission

```http
POST /v1/brand-extraction/jobs
{
  "sourceUrl": "https://example.com",
  "options": { "dynamicRendering": false, "includeFonts": true, "respectRobots": true }
}
```

```json
202 Accepted
{ "jobId": "<uuid>", "status": "queued", "pollUrl": "/v1/brand-extraction/jobs/{jobId}" }
```

```http
GET /v1/brand-extraction/jobs/{jobId}
```

Returns full job state including `extractedColors`, `extractedFonts`, `extractedLogo`, `attribution`, `confidenceScores`.

Error cases:

- `429 BRAND_EXTRACT_RATE_LIMITED` — per-org URL/rate limit
- `403 BRAND_EXTRACT_ROBOTS_BLOCKED` — robots disallow
- `502 BRAND_EXTRACT_FETCH_FAILED` — upstream unreachable
- `422 BRAND_EXTRACT_NO_STYLES_FOUND` — JS-only page with no static styling
- `451 BRAND_EXTRACT_WAF_BLOCKED` — WAF / captcha

### 6.4 Font Upload

```http
POST /v1/brand-kits/{kitId}/fonts                -- multipart, .woff2/.woff/.otf/.ttf/.ttc
```

```json
200 OK
{
  "id": "<uuid>",
  "family": "Acme Sans",
  "isVariable": false,
  "glyphCoverage": { "latin": 0.99, "latinExt": 0.86, "bengali": 0.10 },
  "license": { "kind": "OFL", "permissiveness": "permissive", "licenseUrl": "https://..." },
  "fallbackChain": ["Acme Sans","Inter","system-ui","sans-serif"]
}
```

```http
POST /v1/fonts/{fontId}/license-confirm          -- admin confirms license terms
GET  /v1/brand-kits/{kitId}/fonts?status=...
```

### 6.5 License Check

```http
POST /v1/fonts/license-check
{
  "fontIds": ["<id1>","<id2>"],
  "intent": "publish_brand_kit",                  // 'export_external','embed_in_marketplace', ...
  "workspaceId": "<uuid>"
}
```

```json
200 OK
{
  "results": [
    { "fontId": "<id1>", "status": "ok" },
    { "fontId": "<id2>", "status": "warn",
      "reason": "license_expires_in_22_days",
      "expiresAt": "2026-08-20T00:00:00Z" }
  ]
}
```

### 6.6 Theme Marketplace

```http
GET  /v1/marketplace/listings?industry=...&mood=...
GET  /v1/marketplace/listings/{listingId}        -- includes demo render URL
POST /v1/marketplace/listings                    -- creator publishes
POST /v1/marketplace/listings/{listingId}/purchase
POST /v1/marketplace/install/{purchaseId}        -- installs into a brand_kit draft
```

```http
POST /v1/marketplace/install/{purchaseId}
{ "workspaceId": "<uuid>", "kitNameDraft": "Marketing theme Q3" }
```

```json
200 OK
{
  "draftBrandKitId": "<uuid>",
  "integrityVerified": true,
  "assetLicensesSummary": [{ "name": "Acme Sans", "licenseKind": "OFL" }],
  "warnings": []
}
```

Integrities / failure paths:

- `409 MARKETPLACE_INTEGRITY_MISMATCH` — content hash mismatch on download
- `403 MARKETPLACE_LICENSE_BLOCKED` — org policy blocks bundled asset
- `402 MARKETPLACE_PAYMENT_REQUIRED` — paid listing, payment failed

### 6.7 Lint Pass

```http
POST /v1/decks/{deckId}/lint/run
{ "rulesetVersion": "2026-07", "includeLockedRegions": false }
```

```json
200 OK
{
  "findings": [
    { "ruleId": "LINT_OFF_BRAND_COLOR", "severity": "WARN", "count": 14,
      "elements": [{"slideId":"<uuid>","elementId":"<uuid>","value":"#34D399",
                    "suggestion":{"tokenId":"color.brand.positive","deltaE":2.1}}],
      "fixAction": {"type":"replace_token","proposal":"color.brand.positive"} }
  ],
  "totals": { "block": 0, "warn": 14, "info": 3 },
  "durationMs": 712
}
```

```http
POST /v1/decks/{deckId}/lint/fix
{ "findingIds": ["<uuid>","<uuid>"], "strategy": "nearest_by_deltaE" }
```

---

## 7. Security

### 7.1 Font License Validation

- License kind is parsed from the upload's bundled license file when present; otherwise detected by `name`/`embedded` markings; otherwise marked `unknown`.
- `permissiveness: 'restricted'` triggers an admin-only confirmation flow before any deck using it can be marked share-external (#159).
- License expiry time-bombs (#42) emit lint findings 30 / 7 / 1 days out and a daily email to the kit owner.
- Anti-piracy heuristics (industry-standard) flag obvious cracks; org admins can override with audit.

### 7.2 Brand Extraction Licensing & Attribution

- `brand_extraction_job.attribution` is immutable and includes `sourceUrl`, `fetchedAt`, `contentHash`, `robotsHonored`, `licenseDetected`.
- User cannot publish the resulting kit without accepting a generated "brand usage rights" statement naming the source; the acceptance is timestamped and tied to user ID in `kit.extractionAttestation`.
- Robots.txt is honored by default; per-org opt-in override for owned domains is logged.
- No PII captured from source pages; raw HTML bodies are not persisted (only parsed asset bytes and computed-style snapshots).
- Per-org rate limits are enforced at the gateway: 1 / URL / 5 min, 10 / IP-hour, 100 / workspace-day.

### 7.3 Marketplace Themes — Content Hash Checks

- Each `theme_marketplace_listing` has a `content_hash` computed over the serialized brand kit bundle; install verifies the downloaded bundle's hash against this value; mismatch returns `409 MARKETPLACE_INTEGRITY_MISMATCH`.
- All bundled font and logo assets carry their own `content_hash` and `license_terms`; install cross-references these to confirm no asset was swapped since listing time.
- Creator-side signing: optional content signing via their known public key; `marketplace_purchase.integrity_verified` is the source of truth for downstream audits.

### 7.4 License Compliance Audit Log

- A single append-only log table `audit_license_event` records every license-relevant event: `font_uploaded`, `license_confirmed`, `license_overridden`, `kit_published`, `kit_external_shared`, `marketplace_installed`, `license_expiry_30d_warn`.
- Each row carries `actor_user_id`, `actor_kind` (human / agent / system), `target_id`, `target_kind`, `prev_hash` (hash-chained for tamper evidence), `ts`.
- Retention: 7 years to match #196 audit retention norms; exportable as CSV/JSON for legal review.
- Brand governance dashboard (#194) surfaces license-expiring and license-overridden counts, surfacing compliance gaps to admins.

### 7.5 Threat Model Highlights

- **SSRF**: extraction fetcher only targets user-supplied URLs but uses an outbound proxy that resolves and IP-allowlists known-internal ranges; private RFC1918 ranges are blocked (`BRAND_EXTRACT_PRIVATE_BLOCKED`).
- **Payload smuggling**: SVG logos are sanitized (no script, no foreignObject, no external refs).
- **Abuse**: extraction rate limits per §2.3; alert on /24 cluster of failed jobs.
- **Fonts as malware vector**: font files are sandboxed-parsed (`opentype.js`) before being marked validated; arbitrary native parsing is avoided.
- **MCP/agent safety**: agents receive capability-scoped tokens (#225); theme-application calls go through the same API and are auditable.

---

## 8. Performance

### 8.1 Theme Application Latency

- **Resolve**: server-side `resolve()` cache hit < 5 ms p99; cold lookup < 50 ms p99 with a 60 s TTL.
- **Diff**: server computes a per-element color/font/radius diff of `(themeA resolved → themeB resolved)` and applies CRDT ops; 200-slide deck target < 300 ms p95 (#38 AC).
- **Render**: incremental re-render targets 16 ms per frame; deferred nodes update via a priority queue (visible viewport first, then off-screen).
- **Streaming apply**: for very large decks the diff is split into chunks; first chunk paints, subsequent chunks stream.

### 8.2 Per-Slide Inheritance Resolution Caching

- Cache key: `(deckId, slideId, themeRev, tokenId)` with TTL 60 s; invalidated on theme swap, token edit, slide override change.
- The cache is per-editor-tab but persisted in IndexedDB so reopening a deck hits warm cache.
- Memory budget: 4 MB per editor tab; LRU eviction; cache hit ratio target ≥ 92 % for typical workflows.
- Server-side resolution uses Redis cluster with the same key shape for shared/server-rendered contexts (preview link, marketplace demo).

### 8.3 Palette Accessibility Scoring Budget

- Full WCAG audit on a single theme (≤ 200 tokens, ≤ 50 contrast pairs each): < 50 ms.
- Full deck audit on a 500-slide deck: < 200 ms (per #44 AC, with parallelism and precomputed pair grids).
- CVD simulation: < 30 ms per palette.
- APCA computation: per pair ~ 0.05 ms; bulk deck runs < 500 ms.

### 8.4 Bundle Sizing & CDN

- Fonts are subset-on-demand; default subsets are Latin + Latin-Ext; deck-locale triggers Bengali/CJK/etc. subsets on first render.
- Marketplace demos stream the rendered slide as small frames; demo pages ship at < 200 KB gz initial.

### 8.5 SLO Targets

| Metric                            | Target              |
| --------------------------------- | ------------------- |
| Token resolution p99              | < 5 ms (warm cache) |
| Theme apply p95 (200-slide deck)  | < 300 ms            |
| Lint pass p95 (200-slide deck)    | < 1 s               |
| WCAG audit p95 (single theme)     | < 50 ms             |
| Font upload validation p95        | < 2 s               |
| Brand extraction median           | < 15 s; p95 < 60 s  |
| Marketplace demo frame render p95 | < 80 ms per frame   |

---

## 9. Observability & Testing Strategy

### 9.1 Observability

- **Logs**: structured JSON, one log per theme apply, lint run, extraction job stage, license override, marketplace install. Includes `deckId`, `userId`, `actor_kind (human/agent/system)`, `durationMs`, `findings_count`, `outcome`.
- **Metrics**:
  - `theme.apply.duration_ms` (histogram, labels: deck_size, theme_diff_size, cache_hit_ratio)
  - `token.resolve.duration_ms` (labels: scope, cache_hit)
  - `lint.run.duration_ms`, `lint.findings.count` (labels: severity, rule_id)
  - `extraction.job.duration_ms` (labels: stage, status)
  - `font.upload.outcome_count` (labels: outcome ∈ {validated,rejected,license_unknown})
  - `marketplace.install.outcome_count` (labels: integrity_verified, license_status)
- **Traces**: distributed traces across (fetcher → parser → clusterer → packager); font upload pipeline traced end-to-end.
- **Audit**: license events in `audit_license_event` (hash-chained) — each entry includes trace_id linking back to metrics/logs.
- **Dashboards**: per-org brand kit health (overrides count, expired licenses, lint trends); platform-wide extraction success rate and p95; marketplace integrity-verification rates.
- **Alerts**:
  - extraction success rate < 90 % over 1 h → page on-call
  - marketplace integrity-verified drop < 99 % over 24 h → page
  - font upload rejection spike → page (could indicate a malware vector or a bad UI prompt)
  - theme apply p95 > 500 ms for 5 min → page

### 9.2 Testing Strategy

- **Unit tests (≥ 90 % coverage on theme-engine code)**: token resolution, alias cycle detection, fallback ladder, inheritance cascade, contrast functions, APCA implementation (parity against a reference implementation, fixtures checked in), CVD simulation matrices.
- **Property-based tests**: token edits never cause an invalid resolved output for any of N generated themes; random alias graphs never produce cycles that aren't caught.
- **Integration tests**: theme apply run end-to-end (CRDT diff + audit log); brand extraction job on a sandbox site; font upload with restricted license blocks kit publish.
- **Visual regression**: sample decks rendered per theme token set; per-component palette renders; dark/light pair render parity.
- **Accessibility tests**: automated axe-core run on the editor canvas with multiple themes; colorblind-safe palette fixtures; forced-colors mode simulated.
- **Performance tests**: k6-style scripts applying themes to 200-slide decks; CI gates on p95 budgets.
- **Security tests**: SSRF tests for the extraction fetcher; SVG XSS payload fixtures; font upload parsing on adversarial fixtures.
- **License audit tests**: simulate "license expires in 22 days" → ensure lint warning fires; simulate admin override → ensure audit log entry exists.
- **Marketplace integrity tests**: simulate content hash drift → install blocked.
- **End-to-end agent tests**: an MCP-driven agent (test fixture) calls `apply_theme` end-to-end; agent and human edits coexist correctly in version history.

Definition of done for a theme/brand feature:

1. Token resolution passes full property test suite.
2. WCAG audit and CVD simulations are regression-tested against golden palettes.
3. License audit log entries produced for every license event path.
4. Performance budgets met (CI gate).
5. Marketplace content-hash verification tested both pass and fail cases.
6. Accessibility audited via axe-core on the editor canvas with this feature active.
7. Updated docs and a sample deck showcasing the feature.

---

## 10. Cross-Section Ties

This section enumerates the dependencies on and contributions to other feature sections. Each tie names a feature number, a one-line contract, and a forward pointer.

### 10.1 Section 1 — Core Editor & Canvas (#1–22)

- **#14 Copy/Paste Styles, Format Painter, "Paste to Match Destination"**: pasting a style copies the **resolved token references** (not the resolved values) by default. The pasting element adopts the destination's effective tokens via alias redirection. Format painter has an option: "paste values as literals" (off-brand risk, flagged by lint #46) vs "paste as tokens" (preferred, resolves to destination tokens).
- **#15 Eyedropper**: eyedropper samples a color from the rendered canvas and offers three write targets: (1) literal hex (off-brand risk, lint warns), (2) new token via token creation dialog, (3) alias to an existing token. The third is the recommended path; tokens are first-class.
- **#13 Keyboard-first workflow**: every theme operation has a Cmd-K-palettable action (`Apply Theme`, `Run Lint`, `Open Brand Kit`, `Generate Dark Pair`, `Override Theme on Slide`).
- **#21 Offline / CRDT**: token edits are CRDT-published; when an offline editor reconciles, tokens merge deterministically by `(brandId, tokenId)` LWW; conflicts surface a 3-way merge dialog.
- **#5 Layers Panel search**: a search filter `token:color.brand.primary` finds every element referencing that token — bridging the data view to the visual view.

### 10.2 Section 2 — Components & Templates (#23–36)

- **#25 Smart Component Props**: smart components reference tokens for visual properties (color, type, radius). Function-calling-ready props (#233) use JSON Schema; defaults are token IDs, not literals. The compiler resolves at component-instance time against the active brand context.
- **#36 Brand-Locked Templates**: locked regions declare a token-snapshot at lock time; lint skips them; theme apply (#38) skips them; overrides (#47) cannot target inside them.
- **#28 Theme Marketplace**: marketplace themes install into brand kits (sub-section of section 2 by category, but storage and rendering live in this section's services).
- **#23–36**: every component variant (light/dark, sizes) is a **theme-rebind** under the hood (where possible) plus a small set of size-variant literals. Lint #46 catches off-brand literal attempts.

### 10.3 Section 4 — Live Data & Interactive Charts (#48–64)

- **Chart palettes are token references** (`chart.series.1.color` … `chart.series.12.color`). Charts resolve palettes through the same theme engine (#44 §3.1); #44 audits the resolved palette for identifiability under CVD.
- **#50 Chart Library**: when a user inserts a chart with N series and `N > paletteAvailableCount`, the chart either (a) auto-extends the palette via a perceptual palette-extender, or (b) reduces visible series with a "+N more" affordance; user choice is recorded.
- **#57 Scenario Switcher**: each scenario can carry a **`theme_override`** (state-conditional, #47) — e.g., the bear-case slide uses `negative` and `inverse` surfaces regardless of deck theme.
- **#62 Embedded Live Dashboards** (Looker, Tableau, etc.): dashboards are framed inside an iframe that re-themes itself via a CSS variable bridge from the active theme tokens — embeds pick up brand colors and respect `prefers-color-scheme`.
- **#60 Threshold Alerts**: when a KPI turns red, the threshold style is itself a token reference (`semantic.state.danger.bg`); brand governance can require `negative` tokens to be on-brand for legal disclaimers.

### 10.4 Section 8 — AI Copilot (#108–125)

- **#112 AI Redesign**: AI redesign is constrained by the active brand kit's tokens — it cannot introduce colors or fonts that are off-brand unless the user explicitly accepts off-brand risk (audit-logged). Style lint #46 runs after every AI redesign.
- **#113 Copy Assistant**: copy edits can target content tokens (`content.company.tagline`) when the user checks "use existing token" — preserving consistency across the deck.
- **#115 Voice-to-Deck**: voice-to-deck picks a starter brand (#41) by detecting the speaker's organization; if unknown, the system asks or defaults to the user's most recently used kit.
- **#122 Accessibility AI**: applies the WCAG/CVD rules from #44; this section's accessibility auditor is the engine under the AI assistant.
- **#123 AI Chart Selection**: chart type and palette are chosen together; palette CV-safety is enforced by this section's palette audit.
- **#110 Data-to-Story**: narrative output uses content tokens (`content.brand.narrative.prefix`) where appropriate.

### 10.5 Section 14 — Enterprise, Governance & Platform (#193–204)

- **#194 Brand Governance Dashboard**: reads `brand_kit.governance`, `font_license.expires_at`, `theme_override.count`, `lint.findings`, and `audit_license_event`. Renders an org-wide on-brand score and violation list.
- **#196 Audit Logs**: every lint fix, theme apply, font license override, and marketplace install lands in `audit_license_event` (this section) plus the platform-wide audit log.
- **#200 / #201 Public API & Webhooks**: the entire section 3 API surface (token CRUD, theme apply, lint, marketplace install, font upload) is reachable through the public API; webhooks fire on `theme.applied`, `kit.published`, `license.expiring`, `lint.failed`.
- **#202 Plugin Architecture**: a plugin API allows third-party token providers (e.g., a Material Design sync plugin, a Tailwind theme bridge) — these plugins register a `TokenProvider` and contribute tokens via the same `design_token` table.

### 10.6 Section 16 — Agentic & Programmable Interfaces (#221–240)

- **#221 / #222 MCP server & tool surface**: the MCP server exposes `apply_theme`, `lint_deck`, `extract_brand`, `upload_font`, `create_brand_kit`, `list_marketplace_listings`, `install_marketplace_listing`, `resolve_token`, `set_theme_override`, `generate_dark_pair`. These wrap the section 3 REST APIs 1:1.
- **#223 Structured deck schema**: every element's color/font/radius is stored as a token reference in the JSON/YAML schema; agents write token IDs and the canvas reflects.
- **#225 Agent-scoped permissions**: agent tokens scoped to a single brand context restrict all section-3 calls to that brand; cross-brand reads/writes are denied at the API layer.
- **#227 Tool-call transcript / agent audit trail**: every MCP-initiated call writes to `audit_license_event` with `actor_kind: 'agent'` plus the originating agent ID; rendered in deck version history.
- **#237 Deck linting for agents**: lint results are returned as structured `findings` (rule ID, severity, count, suggestion) so an agent can decide whether to auto-fix. The same engine is used.
- **#240 Deck diffing API**: a deck diff highlights token-reference changes (not just visual diffs), allowing an agent to determine "this section re-themed" programmatically.

### 10.7 Summary of Section-Level Contracts

| Section        | Provides to §3                                              | Consumes from §3                                              |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| §1 Editor      | scene graph, CRDT, format painter, eyedropper               | token resolution, theme apply, lint                           |
| §2 Components  | smart component props, locked regions, marketplace taxonomy | token aliases, brand kit content, theme swap, lint            |
| §4 Charts      | chart palette authoring, scenario state, threshold rules    | chart palette tokens, theme engine, WCAG/CVD audit            |
| §8 AI Copilot  | redesign intent, content tokens, accessibility fixes        | token constraints, accessibility auditor, palette suggestions |
| §14 Enterprise | governance rules, audit pipeline, public API                | brand-kit service, audit log, license tracker                 |
| §16 Agentic    | MCP calls, agent identity, dry-run mode                     | full token/theme/brand API surface                            |

---

## Appendix A — Quick Reference: Feature → Component Map

| Feature                         | Primary components                                               |
| ------------------------------- | ---------------------------------------------------------------- |
| #37 Design token system         | `design_token`, `token_group`, schema validation, alias resolver |
| #38 One-click theme swap        | `theme.apply`, CRDT diff, lint-on-apply hook                     |
| #39 Brand kit                   | `brand_kit`, sub-brand relations, logo storage                   |
| #40 Brand extraction from URL   | `brand_extraction_job`, fetcher, parser, clusterer, reviewer UI  |
| #41 Multi-brand                 | `brand_kit` namespace + per-deck `brandRef`                      |
| #42 Custom font upload          | `font_asset`, `font_license`, fallback chain builder             |
| #43 Dark/light generation       | theme generator (OKLCH), preview shell                           |
| #44 Accessibility-aware theming | accessibility auditor (WCAG + APCA + CVD)                        |
| #45 Theme marketplace           | `theme_marketplace_listing`, demo renderer, integrity verifier   |
| #46 Style linting               | lint engine (off-brand, contrast, forced-colors, font license)   |
| #47 Per-slide theme overrides   | `theme_override`, scope resolver                                 |

## Appendix B — Glossary

- **Token**: a typed, named design decision (color, dimension, etc.) that resolves to a concrete value.
- **Theme**: an immutable, versioned snapshot of resolved tokens; the unit of "swap".
- **Brand kit**: an organization-level bundle of logos, fonts, color sets, themes, and imagery rules.
- **Brand context**: the per-workspace brand currently active; determines token namespace.
- **Override**: a partial token set attached to a slide (or scope) that takes precedence over the active theme.
- **Alias**: a token that points to another token; resolved recursively.
- **Lint finding**: a deck-wide violation categorized by rule, severity, and a fix-action proposal.
- **CVD**: color-vision deficiency (deuteranopia, protanopia, tritanopia, etc.); palettes are simulated against these.
- **APCA**: Accessible Perceptual Contrast Algorithm (WCAG 3 draft); used for `prefers-contrast: more` users.
