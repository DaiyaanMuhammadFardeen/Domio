# Section 2 — Components & Template Ecosystem (Features 23–36)

> Scope: the Canva-scale library of pre-built components, variants, smart props, user/team libraries, the community marketplace, full-deck and section templates, icon/media/sticker libraries, and brand-locked templates.
> Anchors: this section is the connective tissue between the canvas (section 1, features 1–22), the design-token/brand system (section 3, features 37–47), the live-data layer (section 4, features 48–64), the AI copilot (section 8, features 108–125), and the agentic surfaces (section 16, features 221–235).

---

## 1. Feature-by-Feature Mapping

### Feature 23 — 10,000+ pre-built components

**Acceptance criteria**
- A canonical catalog of ≥10,000 components is discoverable from the editor's "Insert → Components" panel and the public marketplace.
- Each component has a unique stable ID, category (Card, Stat, Timeline, Org chart, Quote, Agenda, Comparison table, Roadmap, etc.), thumbnail, preview animation, locale-aware description, tags, and one or more variants.
- Insertion into a slide produces a live, layout-correct instance that respects the slide's theme and auto-layout container (feature 7).
- New components can be added server-side without requiring a client release (catalog versioned).

**Behavioral details**
- A component is a JSON document (the "component document") plus a bundle of static assets (raster, SVG, Lottie, fonts) referenced by hash. See §4.
- Catalog hydration is paged, cached in IndexedDB, and lazy-rendered; only the first 200 components of any category load eagerly, the rest are paged on scroll.
- Components obey the active slide's design tokens (feature 37). If a token is unresolved, the component falls back to its authored default and renders a "theme-degraded" badge in the layers panel.

**Edge cases**
- A component authored for a 16:9 slide inserted into a 4:3 or 9:16 frame — handled via per-component `responsive_overrides` (a list of per-ratio prop remaps), not by auto-scaling text to unreadable sizes.
- A component removed from the marketplace must remain installed in users' decks with a "deprecated — no longer receiving updates" badge; the package must still resolve for offline rendering.
- Bundles referencing external fonts that are later removed from the icon/font subsystem — the component must ship its own fallback in its bundle (no runtime font fetch).

**Dependencies**
- Icon library (feature 32), stock media (feature 33), animation library (feature 34), sticker packs (feature 35), design tokens (feature 37), auto-layout (feature 7), constraints (feature 8), multiplayer presence (feature 17).

---

### Feature 24 — Component variants (light/dark, sizes, states)

**Acceptance criteria**
- Each catalog component ships with a defined `variant_set` (e.g., `theme ∈ {light, dark, brand-light, brand-dark}`, `size ∈ {sm, md, lg}`, `state ∈ {default, hover, pressed, disabled}`).
- Switching a variant on a single instance updates its render within 100 ms p95 (local), 250 ms p95 (multiplayer-broadcast) without disturbing other instances in the same deck.
- Variants are first-class in the prop panel: a "Variant" section with segmented controls replaces the user toggling individual colors/sizes.

**Behavioral details**
- Variants are encoded in the component document as a small matrix of prop remaps (not as separate document graphs). The renderer computes the resolved prop set from `base_props × variant_overrides`.
- Variant switching emits a single `component.variant_changed` CRDT op, which the multiplayer layer (feature 17) broadcasts via the existing CRDT channel — no new protocol.

**Edge cases**
- A user creates a custom variant (feature 26). Custom variants are namespaced to the user's library; they never replace a marketplace variant.
- Variant remap refers to a prop that has since been removed (the prop panel version is older than the component version): the renderer ignores the remap and surfaces a "prop missing" warning.
- Variant overrides that conflict with brand-locked regions (feature 36) — brand locks win silently; the variant switch is logged in audit (feature 196).

**Dependencies**
- Feature 25 (props engine), feature 27 (team library sync), feature 37 (design tokens drive `theme` variant availability), feature 36 (brand lock precedence).

---

### Feature 25 — Smart components with editable props panel

**Acceptance criteria**
- A smart component exposes a typed prop schema (JSON Schema, see §4) describing its editable properties.
- Selecting a smart component instance opens a "Props" tab in the right panel with one form field per prop, fully keyboard-navigable, with inline validation.
- Editing a prop updates the canvas live, never breaks layout (auto-layout + constraints handle the reflow), and propagates to all sync'd views within the multiplayer latency budget.
- Schema is published as part of the component package and is consumable by MCP tool calls (feature 233) and the agentic patch API (feature 234).

**Behavioral details**
- Prop editors are auto-generated from JSON Schema: `string → text/number input`, `number → stepper`, `boolean → toggle`, `enum → segmented control`, `array → repeatable row`, `object → nested panel`, `oneOf/anyOf → discriminated union control`.
- Form fields render in a deterministic order: required props first, then alphabetical by key, with the canonical `title` from the schema as the label.
- The prop panel has a render budget of 50 ms p95; schemas with >40 props are paginated into a "Show advanced" section.

**Edge cases**
- A prop references a data source (feature 48) — the field shows a binding chip ("Bound to: Q3 Sheet → `revenue`"). Editing it requires "unbinding" first to prevent silent data decoupling.
- A prop's value fails schema validation on blur — the canvas retains the last valid value, the field is marked red, and a tooltip explains the rule.
- Two users edit the same prop simultaneously — last-writer-wins is recorded in CRDT history; both see a "X also changed this" toast for 3 seconds.

**Dependencies**
- Feature 26 (user components become smart when they have a schema), feature 48 (data-bound props), feature 233 (function-calling-ready props), feature 234 (natural-language patch), feature 237 (agent lint).

---

### Feature 26 — User-created components (create-component flow)

**Acceptance criteria**
- A user can select any subtree (one or more elements + nested groups) and promote it to a component via right-click → "Create component" or the keyboard shortcut.
- The new component gets an auto-generated name, an editable description, an auto-inferred prop schema (see below), and is added to "My library" (feature 27).
- Subsequent inserts from "My library" create instances that share the component's source; editing the source (master) propagates to all instances unless they have overrides.

**Behavioral details**
- **Prop inference.** When the user creates a component from a selection, the engine inspects each text node, image, color, and number in the selection and proposes a prop for each unique-ish value: text → `string` with `default = current value`; image → `asset` prop pointing at the current asset; color → `color` prop; number → `number`. The user is shown an "Inferred props" dialog to confirm/rename/reorder before saving.
- **Master/instance model.** A master stores the canonical element tree; instances store a list of `prop_overrides` keyed by prop name. Overrides are version-stamped so they survive component updates.
- **Detach.** Right-click an instance → "Detach from component" converts it back into a free subtree with no link to the master.

**Edge cases**
- Selection contains a bound data widget (feature 48): the user is asked "Keep data binding on the instance, or move binding to a prop?". The latter becomes a `dataBinding` prop; the former is preserved verbatim.
- Selection crosses a brand-locked region (feature 36): promotion is blocked with an explanation; the user can create the component from the non-locked subset only.
- Instance has overrides that are invalid under a new component version — the instance keeps its old (deprecated) prop values; a per-instance "Update available" badge appears.

**Dependencies**
- Feature 25 (prop inference), feature 27 (My library), feature 36 (lock interaction), feature 48 (data binding preservation).

---

### Feature 27 — Shared team component libraries (publish/subscribe)

**Acceptance criteria**
- A team workspace has one or more "Team libraries" (one default, plus optional additional scoped libraries per project/brand).
- Team members with the "Publisher" role can publish a component or a versioned update; team members with the "Subscriber" role receive update notifications in-app and via the team activity feed.
- Subscribers can pin a component to a specific version (see feature pin in §3), opt into "track latest," or be on a managed-default that the workspace admin controls.
- Publishing emits a webhook (feature 201) and a row in the activity log.

**Behavioral details**
- **Sync protocol.** A Team Library is a CRDT-like append-only log of `library_event` rows: `publish`, `update`, `deprecate`, `unpublish`. Subscribers sync the log incrementally and apply events in order. Conflicts (two publishers bump the same component to incompatible versions) are resolved by the workspace's "library policy" (default: latest semver wins; admins can pin).
- **Update notifications.** When a subscribed component is updated, every deck containing an instance of it shows a small "Update available" badge on the component in the layers panel; bulk "Update all" and "Update none" actions exist.
- **Forking.** A subscriber can "fork" a team library into their personal library if they need a customized variant — forking is the supported escape hatch from "managed by team."

**Edge cases**
- Offline editor (feature 21): team-library updates are deferred and applied on reconnect with conflict resolution; the offline badge surfaces a "pending library sync."
- A publisher unpublishes a component still in use: instances keep rendering the last-fetched bundle; the layers panel shows "Component removed from library — read-only."
- A team library exceeds the workspace storage budget — publishers see a soft warning; admins see a hard block at upload time.

**Dependencies**
- Feature 21 (offline + CRDT), feature 17 (multiplayer), feature 196 (audit), feature 201 (webhooks).

---

### Feature 28 — Community marketplace (sell/share with revenue share)

**Acceptance criteria**
- A creator can publish a marketplace listing containing one or more components, templates (full/section), themes (feature 45), sticker packs (feature 35), and icon packs.
- Listings have a price (free, one-time, or subscription), a license (single-seat, team, enterprise), a public landing page, ratings and reviews, and a changelog.
- Purchase/install grants a license record for the buyer's account/workspace; revenue is split per the configured payout policy.
- Marketplace is browsable from inside the editor (Insert → Marketplace) and on the public web.

**Behavioral details**
- **Payout policy.** Default 70% creator / 30% platform, configurable per creator (Pro tier: up to 85% creator). Payouts are computed monthly from `revenue_share_event` rows; minimum payout threshold $50; supported payout methods: bank transfer, PayPal, bKash (Bangladesh market), Stripe Connect.
- **License enforcement.** On install, the client receives a signed license token. Each subsequent load verifies the token against the marketplace service (online) and a cached grace period (offline, see §7).
- **Refunds.** Buyer can request a refund within 14 days if usage is below 5 inserts (anti-fraud). Refund decrements the creator's pending payout.

**Edge cases**
- Creator deletes a listing still installed in user decks — listings can be "deprecated" (still installed, no new purchases) or "removed" (uninstalled from opt-in user decks on next sync, hard-deleted after 30 days).
- Chargeback — the marketplace marks the listing as "frozen pending review" until the dispute resolves; the creator's payout for that transaction is held.
- Cross-border tax (Bangladesh context, §11 of the planning guide): for sales into Bangladesh, VAT is computed per the prevailing rate and remitted; the marketplace handles BDT/USD conversion at the invoice timestamp's mid-rate.

**Dependencies**
- Features 29/30/31/35 (listing payloads), feature 45 (theme marketplace reuses infra), section 14 governance (DLP, audit), §11 of planning guide (payment, tax).

---

### Feature 29 — Template gallery by use case

**Acceptance criteria**
- The marketplace and editor expose a gallery filtered by use case: Pitch decks, Board reports, QBRs, All-hands, Classroom, Conference keynotes, Product demos (extensible).
- Each template has a live preview, a "what's included" manifest (slide count, component count, data bindings, fonts), and an estimated size.
- One-click "Use this template" copies it into the user's workspace as a new deck.

**Behavioral details**
- Templates are server-rendered previews (Playwright/headless engine) and stored as MP4/WebM loops; the first frame is a static poster for low-bandwidth contexts.
- The gallery supports faceted search: use case, style (minimal/playful/corporate/academic), color mood, font family, number of slides, "works with offline mode," "free only," "compatible with my team's brand kit."

**Edge cases**
- Template includes fonts not licensed for the user's plan — blocked at install with an upsell or a "use bundled substitute" option.
- Template's brand-locked regions (feature 36) — those locks transfer to the copy; the user is told up-front which regions they'll inherit as locked.

**Dependencies**
- Feature 30 (full deck templates), feature 31 (section templates), feature 36 (lock transfer), section 3 brand kit (auto-application on install).

---

### Feature 30 — Full deck templates with placeholder logic

**Acceptance criteria**
- A full deck template installs as a complete deck with placeholder markers ("replace with your logo", "add your Q3 numbers here") in lieu of real content.
- A "Guided fill-in" mode walks the user through placeholders in narrative order, with each placeholder highlighted on the relevant slide.
- Completing a placeholder either replaces it with the typed content or binds it to a data source (feature 48).

**Behavioral details**
- Placeholders are first-class elements in the deck schema: `{ kind: "placeholder", id, label, type, default_value, hint, slide_id }`. The schema knows the order placeholders should be presented.
- Each placeholder has an inferred smart-component prop schema; binding a placeholder to a data source creates a `dataBinding` prop on the underlying component.

**Edge cases**
- Placeholder references an asset that fails to load (broken CDN URL) — the placeholder falls back to a generic gray box with the label "Asset unavailable" and an upload CTA.
- User deletes a placeholder slide — the guided-fill queue updates; the next/previous buttons reflect the new order.
- Multi-locale deck: placeholders carry translation keys; the guided fill respects the deck's locale.

**Dependencies**
- Feature 25 (props), feature 31 (section templates — a full deck is composed of section templates), feature 48 (data binding), feature 113 (copy/translate).

---

### Feature 31 — Section templates

**Acceptance criteria**
- A "section template" is a reusable multi-slide block (e.g., "Team slide", "Financials section", "Appendix block") insertable into any deck.
- Insertion preserves the section's internal auto-layout, brand bindings, and any locked regions (feature 36).
- Sections can be parameterized (a "Team" section takes a list of team members with name/role/photo) via the smart-component prop pattern.

**Behavioral details**
- Internally a section is a `template` row with `kind = "section"` and a `slides[]` array of slide IDs in order. Insertion creates a deep-copy CRDT subtree rooted at a new `section` element on the target deck.
- Sections support "spread" insertion: a section template marked `spreadable: true` can be inserted multiple times in one deck (e.g., a per-region financials section).

**Edge cases**
- Insertion into a deck with conflicting theme — the section ships with explicit overrides that win; user is shown the diff and can accept/reset.
- Section references components the user doesn't have access to (e.g., from a team library they've been removed from) — the section still installs with a "Missing components — partial render" warning; missing components render as labeled placeholders.

**Dependencies**
- Feature 30 (full decks are composed of sections), feature 27 (team libraries), feature 36 (lock transfer).

---

### Feature 32 — Icon library (100k+ icons, multiple styles, recolorable)

**Acceptance criteria**
- The icon library ships ≥100,000 icons across at least four styles (outline, filled, duotone, glyph), each recolorable, each resizable without quality loss.
- Icons are searchable by name, synonyms, and shape; AI-powered "find an icon that looks like…" works on uploaded sketches (feature 8 cross-tie).
- Icons are SVG, stored as compact path data in the component catalog and bundled for offline use.

**Behavioral details**
- Icons are treated as a special component subtype: `kind: "icon"`. They have a single `color` prop (token-bound) and a `size` prop. No text prop.
- Search uses a trigram index in Postgres for name synonyms + a perceptual hash for visual similarity; the visual-similarity index is built from a CLIP-style embedding model, retrained nightly on user-curated "looks similar" feedback.

**Edge cases**
- An icon style is deprecated — old icons keep rendering; new inserts default to the active style.
- An icon's license doesn't permit commercial use — those icons are gated behind "commercial plan required" and excluded from default search for free-tier users.

**Dependencies**
- Feature 37 (design tokens drive `color`), feature 42 (custom font/upload license patterns inform icon licensing UI).

---

### Feature 33 — Stock photo/video/illustration integrations (Unsplash, Pexels, etc.)

**Acceptance criteria**
- The Insert → Media panel searches multiple stock providers in parallel and presents unified results with consistent metadata (author, license, dimensions).
- Selecting an asset inserts it as a media element with the correct attribution, license metadata, and provider tracking ID.
- Each integration is a plugin (feature 202) implementing a common `StockProvider` interface.

**Behavioral details**
- Asset CDN layout (see §5): each marketplace-installable asset is mirrored to the Domio CDN at install time so that offline editing and stable URLs are guaranteed.
- Attribution is rendered automatically when the asset's license requires it (a small caption in the layers panel and a mandatory `credits[]` entry on the deck's metadata).

**Edge cases**
- Provider API rate-limit hit — search falls back to cached results with a "Results may be stale" banner.
- Provider removes an asset (DMCA, takedown) — the asset is replaced by a "Removed by source — please replace" placeholder in any deck that uses it; the deck owner is notified.

**Dependencies**
- Feature 202 (plugin system), feature 196 (audit log for media swaps), feature 33 internal: §7 security (anti-piracy for downloaded assets).

---

### Feature 34 — GIF and Lottie animation library

**Acceptance criteria**
- The Insert → Animations panel provides a curated library of GIFs and Lottie animations, all free of charge and licensed for commercial use.
- Lottie files can be recolored at runtime via design-token binding; GIFs cannot.
- Animation insertion respects auto-layout (feature 7) and reduced-motion preferences (feature 93).

**Behavioral details**
- Lottie files are validated server-side on upload: each must declare its license, its author, and must pass a malware/script-content scan (Lottie's JSON can technically carry embedded JS — we forbid it at the renderer level regardless).
- GIFs are transcoded to MP4/WebM on upload for size and battery reasons, but the original GIF is preserved for fallback export.

**Edge cases**
- A Lottie references a font the user doesn't have — the renderer downloads it from the CDN or shows a "Font missing — text shown as boxes" warning.
- Animation exceeds the deck's bundle-size budget (see §8) — the user is warned at insert time and given a lower-fps or shorter-duration option.

**Dependencies**
- Feature 7 (auto-layout), feature 79 (Rive/Lottie runtime), feature 93 (reduced motion), feature 202 (third-party Lottie sources via plugins).

---

### Feature 35 — Sticker/annotation packs for informal decks

**Acceptance criteria**
- Sticker packs are grouped, themed bundles of decorative vector elements (arrows, badges, hand-drawn shapes, celebratory stickers).
- Each pack has a marketplace listing (feature 28) with a preview, license, and a clear "for informal decks" label that surfaces brand-compliance warnings for corporate workspaces.
- Stickers insert as standard components with a single recolorable fill and are repositionable/scalable like any element.

**Behavioral details**
- Packs have a `default_color` prop that respects design tokens (feature 37); a sticker set with multiple sub-stickers ships each as a separate component so they can be mixed across packs.

**Edge cases**
- A pack marked "informal only" is installed in a workspace with strict brand governance (feature 194): a soft warning is shown and brand lint (feature 46) flags every sticker insertion as off-brand unless explicitly whitelisted.

**Dependencies**
- Feature 28 (marketplace), feature 46 (brand lint), feature 194 (brand governance).

---

### Feature 36 — Brand-locked templates

**Acceptance criteria**
- A template or section can mark a region (a slide, a layer subtree, an element) as "brand-locked" — meaning non-admin users cannot edit, move, delete, or restyle elements within the region.
- Locked regions are visually indicated with a diagonal-stripe overlay and a lock glyph.
- Locked regions are enforced client-side and server-side; attempts to violate the lock are blocked with a clear explanation, not silently ignored.

**Behavioral details**
- A `brand_lock_region` is a row in the catalog/deck schema: `{ id, scope: "slide" | "element" | "region", selectors: [...], lock_strictness, allowed_overrides[], owner_admin_id }`. Allowed overrides can permit, for example, "color only" but not "text."
- Admins can promote a user to "lock-bypass" for a specific region (e.g., a designer rebuilding the master template).

**Edge cases**
- A locked region references a component whose master is later updated — the lock applies to the post-update shape; if the update reshapes the locked zone, an admin must re-confirm the lock.
- An MCP agent (section 16) tries to edit a locked region — blocked per feature 225 ("cannot touch brand-locked regions") with an explanatory error code returned to the agent.
- Brand lock on a region containing a data-bound widget — bindings are inherited and read-only; users can rebind (admin only).

**Dependencies**
- Feature 26 (create-component), feature 30/31 (templates), feature 194 (brand governance), feature 225 (agent permissions), feature 46 (brand lint).

---

## 2. UX Flows

### 2.1 Browsing the marketplace

1. **Entry points.** "Insert → Marketplace" in the editor; the public marketplace website; a "Templates" tab on a fresh project.
2. **Discover.** Faceted filters (use case, style, color mood, font family, free/paid, language), trending row, "Made by teams like yours" (industry + size cohort), and a search bar with synonym and shape-similarity support.
3. **Inspect.** Listing page shows live preview, screenshots, "what's included" manifest, license, reviews, changelog, and an "Open in editor" deep link that opens the editor with the listing pre-staged in the insert panel.
4. **Install.** Single primary CTA: "Add to library." Secondary: "Preview in current deck." A confirmation dialog discloses pricing and license terms; for paid items, payment flow (feature 28). The install lands the asset in "My library" and shows a success toast with an "Open" action.
5. **Failure states.** Network error → retry with cached preview; payment declined → explain which payment method failed; license geo-block → explain why and link to T&Cs.

### 2.2 Inserting a smart component

1. The user opens "Insert → Components," picks a category, searches or scrolls, hovers to see a preview.
2. Click-drag onto the canvas (or click + use arrow keys for keyboard insertion). Auto-layout (feature 7) absorbs the new element; the slide's grid (feature 10) snaps to the nearest sensible position.
3. On selection, the right panel's default "Design" tab is replaced by a "Props" tab (when the component has a schema). The Props tab renders a typed form per the schema (§4).
4. The user edits a prop; the canvas updates within one frame (16 ms target for local edits, see §8). A small "synced" indicator appears if multiplayer viewers are present.
5. The user commits by clicking outside the panel or pressing Enter; the panel collapses to a summary view. A "Reset to defaults" link is available per prop.

### 2.3 Editing props via a typed form

- The Props tab is a flat list of sections: "Content," "Layout," "Style," "Behavior" (data binding, if any), "Advanced" (collapsed by default).
- Each field has a label (from the schema's `title`), an inline help icon (from `description`), and an inline error region (from the JSON Schema's `errorMessage`).
- Required fields are marked with an asterisk; the canvas retains the last valid value while the user types invalid input.
- The form supports undo/redo at the prop-value level (each prop edit is a CRDT op, not a single "form submit" event).
- For data-bound props (feature 48), the field is rendered with a binding chip; clicking the chip opens the binding picker.

### 2.4 Promoting elements to a component

1. The user selects one or more elements on the canvas (multi-select, feature 4).
2. Right-click → "Create component" or shortcut. A modal opens showing the inferred props (§1.26) with checkboxes for each proposed prop.
3. The user renames props, reorders them, and writes a description. A live preview shows the new component in isolation.
4. On save, the selection is replaced by an instance of the new component; the component appears in "My library" with a "Just created" badge.
5. A follow-up dialog offers: "Use in another deck?" (shares to a team library if in a workspace), "Publish to marketplace?" (opens the publishing flow).

### 2.5 Creating variants

1. In the component's master edit view (right-click instance → "Edit master"), the user clicks "+ Variant."
2. A variant editor opens with the current props as the baseline; the user changes any subset of props (color, size, state) and saves.
3. The variant gets a name and joins the variant matrix. Variants are flat — no inheritance — so every variant is fully self-describing.
4. Switching a variant on an instance updates only the variant selector prop; all other overrides remain intact.

### 2.6 Sharing team libraries

1. In a team workspace, a Publisher navigates to "Team library" → "Publish."
2. They select one or more components/templates, write release notes, choose a semver bump, and click "Publish."
3. Subscribers receive an in-app notification and (if subscribed via email) an email digest at the cadence they chose.
4. On the subscribers' next load, instances of updated components show an "Update available" badge; bulk update / per-instance pin / per-instance fork actions are available.

### 2.7 Applying brand-locked templates

1. The user installs a brand-locked template (e.g., a corporate pitch deck) from the marketplace or a team library.
2. On insertion, a dialog explains: "This template contains N locked regions. You can edit content but not layout/branding in those zones."
3. Locked regions are visualized on the canvas with a striped overlay and a lock glyph; hovering the lock shows the lock owner and the allowed-override list.
4. The user can request unlock access from the admin; the request is queued in the activity feed (feature 189).

---

## 3. Functional & Non-Functional Requirements

### 3.1 Functional Requirements

| # | Requirement | Source feature(s) |
|---|---|---|
| F-COM-1 | The system shall version every component package using semver, with immutable version IDs. | 27, 28 |
| F-COM-2 | The system shall resolve and install the correct transitive dependency closure for any component (component A may depend on theme T and icon pack I). | 23, 27, 28 |
| F-COM-3 | The system shall validate prop values against the component's published JSON Schema before persisting to the deck CRDT. | 25, 26 |
| F-COM-4 | The system shall render the prop form within 50 ms p95 for schemas of up to 40 props. | 25 |
| F-COM-5 | The system shall support pinning an instance to a specific component version, independent of the workspace's default. | 24, 27 |
| F-COM-6 | The system shall allow component packages to declare their license and enforce that license on every install and load. | 28, 36 |
| F-COM-7 | The system shall provide an MCP tool surface for component install, list, search, and schema retrieval. | 28, 222, 233 |
| F-COM-8 | The system shall store a complete audit trail of every component install, update, and uninstall, including the agent/human originator. | 27, 196, 227 |
| F-COM-9 | The system shall allow an admin to mark a workspace region as brand-locked and enforce that lock on canvas edits, agent edits, and import flows. | 36, 225 |
| F-COM-10 | The system shall detect and block off-brand insertions (component from a non-approved pack in a strict-governance workspace). | 35, 46, 194 |

### 3.2 Non-Functional Requirements

| # | Requirement | Target | Source |
|---|---|---|---|
| NFR-COM-1 | Marketplace search latency p95 | ≤ 400 ms (warm), ≤ 1.2 s (cold) | 28 |
| NFR-COM-2 | Marketplace search indexing lag (new listing visible) | ≤ 60 s after publish | 28 |
| NFR-COM-3 | Component install time p95 (catalog bundle) | ≤ 1.5 s for ≤ 5 MB; ≤ 4 s for ≤ 50 MB | 23, 28 |
| NFR-COM-4 | Prop panel render budget | 50 ms p95 / 100 ms p99 | 25 |
| NFR-COM-5 | Variant switch render time | 100 ms p95 | 24 |
| NFR-COM-6 | Bundle size for a single component (code + assets) | ≤ 250 KB gzipped by default; up to 5 MB with explicit "heavy" flag | 23, 34 |
| NFR-COM-7 | Marketplace indexing throughput | ≥ 200 listings/sec sustained | 28 |
| NFR-COM-8 | Reviews/ratings moderation queue latency (automated) | ≤ 30 s for auto-flag; ≤ 24 h for human review | 28 |
| NFR-COM-9 | Concurrent installs per workspace | ≥ 100 simultaneous without degradation | 27 |
| NFR-COM-10 | Marketplace availability | 99.9% rolling 30-day | 28 |
| NFR-COM-11 | Component bundle offline-availability | 100% of installed components must render offline for ≥ 30 days | 21, 27 |
| NFR-COM-12 | Schema validation determinism | Identical input → identical accept/reject across clients | 25, 26 |
| NFR-COM-13 | Localization | All marketplace surfaces and prop panel labels available in en, bn, es, fr, de, ja, zh-CN at v1; extensible | 12.4 of planning guide |
| NFR-COM-14 | Accessibility | Prop panel meets WCAG 2.2 AA; full keyboard navigation; screen-reader labels for every prop | 3.5 of planning guide |

### 3.3 Component dependency resolution

Components may declare dependencies of three kinds:

1. **Hard runtime dependency** — `requires: [{ kind: "component", id: "stat-card", semver: "^2.0.0" }]`. Installation must include or refuse if unsatisfiable.
2. **Theme dependency** — `requires: [{ kind: "theme", id: "brand-light", semver: "^1.0.0" }]`. Optional but recommended; if missing, component renders with `theme-degraded` badge.
3. **Asset dependency** — `requires: [{ kind: "asset", id: "logo.svg", hash: "sha256:..." }]`. Bundled or fetched from CDN.

Resolution algorithm: a pure-function resolver (`resolve(component, registry, installed) → resolution_plan`) that uses the same semver rules as npm but with a flatter graph (no peer/dev dependencies). Conflict resolution: workspace's "library policy" picks the highest mutually-compatible version; ties broken by `updated_at` then alphabetically. Pinning on an instance overrides the resolver.

### 3.4 Version pinning semantics

- **Track latest** (default) — instance uses the highest version in the resolved closure.
- **Pin to version** — instance uses exactly that version forever (or until the user unpins).
- **Pin to range** — instance uses the highest version within the range; useful for "patch-only updates."
- **Workspace managed** — workspace admin defines the policy; users can't change per-instance.

A pinned instance that loses its pinned version (e.g., the publisher unpublishes it) renders the last-fetched bundle and shows "Pin target unavailable — fallback rendering."

### 3.5 Reviews & ratings moderation

- A reviewer submission triggers an automated pipeline: profanity filter, spam heuristics (rate, IP, similarity to existing reviews), trust score (reviewer's history), and a sentiment classifier.
- Reviews with auto-flag score > threshold are queued for human moderation (24 h SLA).
- A review from a buyer with a confirmed install is given a "Verified buyer" badge.
- Sellers can request review re-evaluation once per review; the platform's trust & safety team arbitrates.

---

## 4. Architecture

### 4.1 Component registry

The component registry is a single logical service (`registry-service`) backed by Postgres for metadata and a content-addressed object store (S3-compatible, e.g., MinIO) for bundles.

```text
+-----------------------+        +---------------------------+
|   Editor / MCP / CLI  | <----> |     registry-service      |
|   (HTTP + WebSocket)  |        |  (catalog, install, sync) |
+-----------------------+        +-------------+-------------+
                                                  |
                       +--------------------------+--------------------------+
                       |                          |                          |
                +------v------+            +------v------+            +------v------+
                |  Postgres   |            | Object Store|            |  Search      |
                | (catalog,   |            | (bundles,   |            |  (OpenSearch |
                |  versions,  |            |  content-   |            |   /pg trigram|
                |  installs)  |            |  addressed) |            |   index)     |
                +-------------+            +-------------+            +-------------+
```

**Sub-modules** (logical boundaries within the service — see §4.2 of the planning guide on modular monolith):

1. `catalog` — list, search, version resolution.
2. `bundles` — upload, fetch, content-hash verification, signed-URL issuance.
3. `props` — JSON Schema validation engine.
4. `sync` — team library event log + apply.
5. `marketplace` — listings, search, ratings, payments, payouts.
6. `moderation` — review/listing content moderation pipeline.
7. `analytics` — install/usage telemetry (feeds feature 174).

### 4.2 Prop schema engine (JSON Schema)

We use JSON Schema (draft 2020-12) as the canonical prop schema language, with these constraints:

- `type` ∈ `string | number | integer | boolean | array | object | null`, plus `oneOf`/`anyOf` for unions.
- `format` extensions: `color`, `color-with-alpha`, `font-family`, `asset-ref`, `data-binding`, `enum-friendly-name`.
- `x-domio-prop`: a Domio-specific extension with `category` (Content/Layout/Style/Behavior/Advanced), `control` override (e.g., force a `slider` even if the type is `number`), and `livePreview: boolean` (whether the canvas should re-render on each keystroke).

**Example — a KPI card's props schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "domio://component/stat-card/props/v2",
  "title": "Stat Card Props",
  "type": "object",
  "required": ["value", "label"],
  "properties": {
    "value": {
      "type": "number",
      "title": "Value",
      "x-domio-prop": { "category": "Content", "control": "stepper" }
    },
    "label": {
      "type": "string",
      "title": "Label",
      "minLength": 1,
      "maxLength": 60,
      "x-domio-prop": { "category": "Content" }
    },
    "trend": {
      "type": "string",
      "enum": ["up", "down", "flat"],
      "default": "flat",
      "x-domio-prop": { "category": "Content", "control": "segmented" }
    },
    "trendValue": {
      "type": "number",
      "title": "Trend delta",
      "x-domio-prop": { "category": "Content" }
    },
    "icon": {
      "type": "string",
      "format": "asset-ref",
      "title": "Icon",
      "x-domio-prop": { "category": "Style" }
    },
    "size": {
      "type": "string",
      "enum": ["sm", "md", "lg"],
      "default": "md",
      "x-domio-prop": { "category": "Layout", "control": "segmented" }
    },
    "variant": {
      "type": "string",
      "enum": ["light", "dark"],
      "default": "light",
      "x-domio-prop": { "category": "Style", "control": "segmented" }
    },
    "dataBinding": {
      "type": "object",
      "title": "Data binding",
      "x-domio-prop": { "category": "Behavior" },
      "properties": {
        "source": { "type": "string" },
        "field":  { "type": "string" }
      }
    }
  },
  "additionalProperties": false
}
```

The engine itself is a small, dependency-light Rust crate (`domio-schema`) with bindings for Node, Python, and WebAssembly — the same validator runs in the editor, in MCP tools, in the marketplace moderation service, and in CI tests.

### 4.3 Template engine

A template is a **structured deck document** (the same `deck.json` schema used by all decks) with two additions:

- A `manifest` block describing placeholder slots, recommended replacements, and the order of the "guided fill."
- A `placeholders[]` array (each placeholder is a typed element with `{ kind, id, label, type, default_value, hint }`).

The template engine:

1. Validates the template's `deck.json` against the standard deck schema (rejects malformed templates at upload).
2. Validates that every `placeholder` element resolves to a real element in the deck.
3. Renders the listing's preview by spinning up a headless render of the deck with placeholder values resolved.
4. On install, deep-copies the template's deck document into the user's workspace, replacing `placeholder` elements with their default values (which the user can then edit).

### 4.4 Marketplace service

The marketplace service is a separate module (still part of the modular monolith at v1) exposing:

- Public read APIs (search, listing detail, reviews, changelog) — cached aggressively at the CDN edge.
- Authenticated write APIs (publish, update, deprecate, unpublish) — gated by the creator's verified status.
- Webhook emitters (feature 201) for install, update, refund, payout events.
- Payment integration via Stripe Connect (international) and bKash/Nagad (Bangladesh), routed through an aggregator (SSLCommerz/ShurjoPay) for the local market per §11.5 of the planning guide.

### 4.5 Shared library sync protocol

The team-library sync protocol is a CRDT-flavored append-only log. Each event is a row in `library_event`:

```text
{
  id: ulid,
  workspace_id: uuid,
  library_id: uuid,
  seq: monotonic per-library,
  kind: "publish" | "update" | "deprecate" | "unpublish",
  component_id: uuid,
  version: semver,
  payload_ref: content-hash (in object store),
  actor_id: uuid,
  created_at: timestamptz
}
```

Subscribers fetch the log incrementally by `(library_id, last_known_seq)`. Apply is deterministic — the same event sequence yields the same library state on every subscriber. Conflicts (e.g., two publishers updating the same component to incompatible versions) are resolved by the workspace's library policy at apply time, never at fetch time.

Offline clients (feature 21) queue events locally and apply on reconnect; the apply is idempotent because events are keyed by `(library_id, seq)`.

### 4.6 Versioned component packages

A package is a **content-addressed tarball** with this layout:

```text
component-package-v1.2.3/
├── manifest.json         # { id, name, version, license, deps[], author, ... }
├── schema.json           # JSON Schema for props (v1, $id includes version)
├── variants.json         # variant matrix
├── theme-overrides.json  # optional theme fallbacks
├── render/               # declarative render definition (SVG path data, Lottie refs)
│   ├── base.json
│   └── variants/*.json
├── assets/
│   ├── icon-1.svg
│   ├── icon-1@2x.png     # for legacy raster
│   └── preview-poster.png
└── signature.sig         # Ed25519 signature over a canonicalized manifest
```

The tarball is uploaded to the object store; its content hash becomes the `package_hash`. The Ed25519 signature is verified against the publisher's registered public key at install time (see §7).

---

## 5. Data Model

Postgres tables, all with `id uuid primary key default gen_random_uuid()` and `created_at`, `updated_at timestamptz default now()` unless otherwise noted. JSONB columns hold the bulk of variable-shape data.

```sql
-- The canonical component definition. Versions are rows here; install instances are not.
create table component (
  id                  uuid primary key,
  catalog_id          uuid not null,            -- stable across versions
  version             semver not null,          -- e.g. '2.1.0'
  kind                text not null,            -- 'component' | 'icon' | 'sticker' | 'animation'
  category            text not null,            -- 'card' | 'stat' | 'timeline' | ...
  name                text not null,
  description         text,
  author_id           uuid not null,            -- creator or org
  workspace_id        uuid,                     -- null for marketplace-global
  license_id          uuid not null,
  package_hash        text not null,            -- content-addressed in object store
  package_size_bytes  bigint not null,
  props_schema        jsonb not null,           -- JSON Schema draft 2020-12
  variants            jsonb not null default '{}'::jsonb,
  default_theme_id    uuid,
  theme_overrides     jsonb default '{}'::jsonb,
  tags                text[] not null default '{}',
  deprecation         jsonb,                    -- { reason, deprecated_at, sunset_at }
  signature           text not null,            -- base64 Ed25519
  signing_key_id      uuid not null,
  search_tsv          tsvector,                 -- generated column for name+desc+tags
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (catalog_id, version)
);
create index on component using gin (tags);
create index on component using gin (search_tsv);
create index on component (author_id);

-- Variants are typically encoded inside component.variants, but for marketing/listing
-- we also denormalize them for fast marketplace search filtering.
create table component_variant (
  id              uuid primary key,
  component_id    uuid not null references component(id) on delete cascade,
  variant_key     text not null,                -- 'theme.dark'
  display_name    text not null,
  prop_overrides  jsonb not null,               -- partial props object
  preview_hash    text,                         -- optional rendered preview
  unique (component_id, variant_key)
);

-- A smart component prop. Mirrors props_schema for queryability; JSONB keeps it flexible.
create table smart_component_prop (
  id              uuid primary key,
  component_id    uuid not null references component(id) on delete cascade,
  prop_key        text not null,
  title           text not null,
  category        text not null,                -- 'Content' | 'Layout' | 'Style' | 'Behavior' | 'Advanced'
  data_type       text not null,                -- JSON Schema type
  control         text,                         -- 'segmented' | 'slider' | 'stepper' | 'color-picker' | ...
  enum_values     jsonb,                        -- when data_type = 'string' with enum
  default_value   jsonb,
  required        boolean not null default false,
  schema_fragment jsonb not null,               -- the per-prop JSON Schema fragment
  live_preview    boolean not null default true,
  unique (component_id, prop_key)
);

-- A personal component library. Every user gets one; workspaces may have additional team libraries.
create table user_library (
  id                  uuid primary key,
  owner_user_id       uuid not null unique,
  items               jsonb not null default '[]'::jsonb,  -- [{ component_id, pinned_version, ... }]
  updated_at          timestamptz not null default now()
);

create table team_library (
  id                  uuid primary key,
  workspace_id        uuid not null,
  name                text not null,
  description         text,
  policy              jsonb not null default '{"mode":"latest"}'::jsonb,  -- 'latest' | 'pinned' | 'range'
  default_version_strategy text not null default 'latest',  -- 'latest' | 'patch' | 'minor'
  created_at          timestamptz not null default now(),
  unique (workspace_id, name)
);

create table team_library_event (
  id                  uuid primary key,
  workspace_id        uuid not null,
  library_id          uuid not null references team_library(id) on delete cascade,
  seq                 bigint not null,
  kind                text not null,            -- 'publish' | 'update' | 'deprecate' | 'unpublish'
  component_id        uuid not null references component(id),
  version             semver not null,
  payload_ref         text not null,            -- content-hash in object store
  actor_id            uuid not null,
  created_at          timestamptz not null default now(),
  unique (library_id, seq)
);

-- Marketplace listings are a layer over components. A listing may bundle multiple components.
create table marketplace_listing (
  id                  uuid primary key,
  slug                text not null unique,
  kind                text not null,            -- 'component' | 'template' | 'section' | 'theme' | 'sticker_pack' | 'icon_pack'
  title               text not null,
  tagline             text,
  description         text,
  long_description    text,
  preview_video_hash  text,
  preview_poster_hash text,
  manifest            jsonb not null,           -- { components: [...], templates: [...], ... }
  price_cents         integer not null default 0,  -- 0 = free
  currency            text not null default 'USD',
  license_id          uuid not null,
  seller_id           uuid not null,
  revenue_share_pct   numeric(5,2) not null default 70.00,
  status              text not null default 'draft',  -- 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed'
  published_at        timestamptz,
  search_tsv          tsvector,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on marketplace_listing using gin (search_tsv);
create index on marketplace_listing (seller_id);

create table marketplace_review (
  id                  uuid primary key,
  listing_id          uuid not null references marketplace_listing(id) on delete cascade,
  reviewer_id         uuid not null,
  rating              smallint not null check (rating between 1 and 5),
  title               text,
  body                text,
  verified_buyer      boolean not null default false,
  moderation_status   text not null default 'pending',  -- 'pending' | 'auto_flagged' | 'approved' | 'rejected' | 'removed'
  moderation_meta     jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (listing_id, reviewer_id)
);
create index on marketplace_review (listing_id, moderation_status);

-- License grants for paid and free listings. Server enforces on every load.
create table license_grant (
  id                  uuid primary key,
  listing_id          uuid not null references marketplace_listing(id),
  grantee_kind        text not null,            -- 'user' | 'workspace'
  grantee_id          uuid not null,
  license_id          uuid not null,
  seats               integer,                  -- null = unlimited within grantee
  issued_at           timestamptz not null default now(),
  expires_at          timestamptz,
  status              text not null default 'active',  -- 'active' | 'revoked' | 'refunded'
  signed_token        text not null,            -- JWT-like, signed by license service
  unique (listing_id, grantee_kind, grantee_id)
);

-- Payout events for revenue share. Each row is an immutable ledger entry.
create table revenue_share_event (
  id                  uuid primary key,
  listing_id          uuid not null references marketplace_listing(id),
  seller_id           uuid not null,
  order_id            uuid not null,
  gross_cents         bigint not null,
  fee_cents           bigint not null,
  net_cents           bigint not null,
  currency            text not null,
  payout_status       text not null default 'pending',  -- 'pending' | 'eligible' | 'paid' | 'held' | 'refunded'
  payout_method       text,                     -- 'bank' | 'paypal' | 'bkash'
  period_month        date not null,            -- first day of the period
  created_at          timestamptz not null default now(),
  unique (order_id, listing_id)
);
create index on revenue_share_event (seller_id, period_month, payout_status);

-- A template. May be a full deck or a section.
create table template (
  id                  uuid primary key,
  kind                text not null,            -- 'full_deck' | 'section'
  catalog_id          uuid not null,
  version             semver not null,
  name                text not null,
  description         text,
  author_id           uuid not null,
  workspace_id        uuid,                     -- null for marketplace-global
  license_id          uuid not null,
  deck_doc            jsonb not null,           -- the full deck.json for a full deck, or section for a section
  manifest            jsonb not null,           -- placeholder manifest
  preview_hash        text,
  brand_lock_regions  jsonb default '[]'::jsonb,
  tags                text[] not null default '{}',
  package_hash        text not null,
  signature           text not null,
  signing_key_id      uuid not null,
  created_at          timestamptz not null default now(),
  unique (catalog_id, version)
);

-- A section template is a special-case template that can be inserted into any deck.
-- We mirror them in their own table for marketplace search filtering by section type.
create table section_template (
  id                  uuid primary key references template(id) on delete cascade,
  section_type        text not null,            -- 'team' | 'financials' | 'appendix' | ...
  spreadable          boolean not null default false,
  default_slide_count smallint not null default 1,
  parameters          jsonb not null default '{}'::jsonb  -- top-level smart-component props
);

create table sticker_pack (
  id                  uuid primary key,
  catalog_id          uuid not null,
  version             semver not null,
  name                text not null,
  sticker_count       smallint not null,
  style_tags          text[] not null default '{}',
  informal_only       boolean not null default true,
  package_hash        text not null,
  signature           text not null,
  unique (catalog_id, version)
);

-- A brand-locked region is a marker on a deck or template that constrains edits.
create table brand_lock_region (
  id                  uuid primary key,
  template_id         uuid references template(id) on delete cascade,
  deck_id             uuid,                     -- nullable; lock on a specific deck
  scope               text not null,            -- 'slide' | 'element' | 'region'
  selectors           jsonb not null,           -- path expressions into deck.json
  lock_strictness     text not null default 'strict',  -- 'strict' | 'color-only' | 'text-only'
  allowed_overrides   jsonb not null default '[]'::jsonb,
  owner_admin_id      uuid not null,
  expires_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index on brand_lock_region (template_id);
create index on brand_lock_region (deck_id);
```

### 5.1 Asset CDN layout

The asset CDN is a content-addressed, signed-URL-fronted object store. Layout:

```text
s3://domio-assets/
├── components/
│   └── {catalog_id}/
│       └── {version}/
│           ├── package.tar      # canonical package
│           ├── manifest.json
│           ├── schema.json
│           └── assets/...
├── templates/
│   └── {catalog_id}/{version}/...
├── stickers/
│   └── {catalog_id}/{version}/...
├── media/
│   └── {asset_uuid}/{ext}        # for stock media
├── previews/
│   └── {listing_id}/poster.png
│   └── {listing_id}/loop.mp4
└── thumbnails/
    └── {listing_id}/thumb-{ratio}.webp
```

URLs are signed (short-lived) for paid content; free content uses long-lived immutable URLs (since the content is content-addressed, immutability is free). The CDN is multi-region with a primary in `ap-south-1` for Bangladesh latency (planning guide §12.2).

---

## 6. APIs and Contracts

All APIs are versioned (`/v1/`). The marketplace APIs are public (rate-limited by IP and API key); the registry APIs require an authenticated session (cookie or bearer token) plus, for write operations, a per-workspace capability check.

### 6.1 Component install / uninstall

```http
POST   /v1/components/{catalog_id}/install
       Body: { version?: semver, workspace_id?: uuid }
       → 201 { install_id, version, package_hash, license_grant_id }

POST   /v1/components/{catalog_id}/installations/{version}/uninstall
       → 204
       Side effect: removes the component from user_library.items; instances in decks
       remain but render with "Component removed from library — read-only" badge.
```

### 6.2 Marketplace search

```http
GET    /v1/marketplace/listings
       Query: q, kind, use_case, style, color_mood, font_family, free_only,
              language, sort (relevance|trending|newest|top_rated),
              page, per_page (max 50)
       → 200 {
         results: Listing[],
         facets: { kind: {…}, style: {…}, ... },
         total: int,
         next_page: string | null
       }
```

### 6.3 Listing detail, reviews, and license management

```http
GET    /v1/marketplace/listings/{slug}      → ListingDetail (incl. manifest, files, license)
POST   /v1/marketplace/listings/{id}/reviews
       Body: { rating: 1..5, title?, body? }
       → 201 Review  (triggers moderation pipeline; review is visible only after approval)

GET    /v1/marketplace/listings/{id}/reviews → Review[]
       Query: sort, page, per_page; only `approved` returned by default.

PATCH  /v1/licenses/{grant_id}
       Body: { action: "revoke" | "extend", expires_at?, reason }
       → 200 LicenseGrant  (admin only)
```

### 6.4 Component package download

```http
GET    /v1/components/{catalog_id}/versions/{version}/package
       Headers: X-License-Token (signed JWT)
       → 302 to a signed CDN URL (5-minute TTL)
       → Or 200 with the tarball directly for very small packages
```

### 6.5 Webhooks (consumed by seller systems)

```http
POST   <seller_webhook_url>
       Headers: X-Domio-Signature (HMAC over body using seller's secret)
       Body events:
         - listing.published, listing.updated, listing.deprecated, listing.removed
         - review.created, review.approved, review.rejected
         - order.created, order.refunded
         - payout.eligible, payout.paid, payout.held
```

### 6.6 Revenue share payout events

A monthly batch job reads `revenue_share_event` rows where `payout_status = 'eligible' AND period_month = current_period`, groups by seller, applies currency conversion (FX mid-rate of the payout execution date), and emits a `payout.paid` event per seller. Each event also writes a `payout_ledger_entry` row for audit.

### 6.7 MCP / Agentic surface (section 16 tie-in)

The component/template ecosystem exposes the following MCP tools (feature 222):

```text
list_components({ query, kind, tags, sort, limit, cursor }) → ComponentSummary[]
describe_component({ catalog_id, version? })               → { manifest, schema, variants, license }
install_component({ catalog_id, version?, workspace_id })   → { install_id, license_grant_id }
uninstall_component({ catalog_id, workspace_id? })          → {}
search_marketplace({ query, filters, sort, limit, cursor }) → ListingSummary[]
get_listing({ slug })                                       → ListingDetail
purchase_listing({ slug, workspace_id, seats? })            → { license_grant_id }
pin_component_version({ catalog_id, version, scope })        → {}   // scope: 'instance' | 'workspace'
get_component_props_schema({ catalog_id, version? })         → JSONSchema
apply_template({ template_id, target_deck_id })             → { deck_id }
```

Tools return machine-readable JSON; error codes follow the MCP error convention with Domio-specific extensions (`ERR_BRAND_LOCK`, `ERR_LICENSE_MISSING`, `ERR_PIN_UNAVAILABLE`).

---

## 7. Security

### 7.1 Signed component packages

Every component package is signed Ed25519 by the publisher's registered key at publish time. The signature covers a canonicalized manifest (`package_hash + catalog_id + version + license_id + author_id`).

**Verification flow** at install:

1. Fetch the package from the CDN (or local cache).
2. Compute the content hash; reject if it doesn't match `component.package_hash`.
3. Verify the Ed25519 signature against the publisher's registered public key (key fetched from a well-known JWKS endpoint).
4. Verify the publisher's signing key is not revoked (cache TTL 1 hour, refresh on miss).
5. Verify the package's declared license is one we accept.

Publishers must rotate keys at least annually; rotation is logged in `signing_key_history`.

### 7.2 License checks

Every render of a paid component verifies a license grant:

- **Online:** the client sends the license token to the license service, which verifies signature, expiry, seats, and revocation status. Response cached for 5 minutes.
- **Offline:** the client uses a cached "license proof" — a signed assertion that was valid within the last 30 days. After 30 days offline, the renderer displays "License re-verification required — connect to continue" but does **not** hard-fail the render (per NFR-COM-11).

License tokens are JWTs signed by the license service's key, with claims `{ sub: grantee_id, listing_id, license_id, seats, exp, iat, jti }`. The token is bound to a device fingerprint to deter casual sharing; enterprise tokens are seat-counted server-side.

### 7.3 Isolation between components

Components render inside an iframe-style sandbox with a strict CSP:

- No `eval`, no `Function()` constructor.
- No external script loading; assets must be content-addressed and same-origin.
- Lottie files are stripped of any `ks` (script) features at upload time.
- Plugins (feature 202) that need more capability run in a separate "plugin VM" with their own permission grants.

### 7.4 Marketplace content moderation

- **At publish:** every listing passes through an automated pipeline — text classification (toxicity, hate, sexual content), image classification (the same on the preview), license validation, malware scan of bundles.
- **At review:** every review passes the same pipeline plus a spam classifier; auto-flagged reviews go to human moderation.
- **Ongoing:** listings are re-scanned weekly and on any user report. A listing with two unresolved reports is auto-hidden pending review.

### 7.5 Anti-piracy

- All paid bundles are wrapped in an encrypted tarball at the CDN layer; decryption keys are served per-license-grant. Direct URL sharing is meaningless.
- The renderer watermarks paid components with a low-visibility client-id trace (analogous to forensic watermarking) to detect leaks.
- The license service monitors for "credential sharing" heuristics — same license used from many geographies in short windows — and flags the account.
- Marketplace listings may not re-host assets whose licenses forbid redistribution; the publishing flow rejects these at upload time.

---

## 8. Performance

### 8.1 Bundle size limits

| Component type | Default limit | Hard cap (with explicit "heavy" flag) |
|---|---|---|
| Standard component | 250 KB gzipped | 1 MB gzipped |
| Icon | 8 KB per icon | 32 KB per icon |
| Sticker pack | 1 MB gzipped total | 5 MB gzipped total |
| Animation (Lottie) | 250 KB gzipped | 1 MB gzipped |
| Template (full deck) | 5 MB gzipped | 25 MB gzipped |
| Section template | 1 MB gzipped | 5 MB gzipped |

A bundle over its default limit shows a warning at insert time; over its hard cap, the bundle is rejected at publish time.

### 8.2 Lazy loading

- **Component code/bundle.** Loaded on first insert; cached forever after.
- **Prop schema.** Loaded with the component; validated lazily on first prop render.
- **Variants.** Each variant's preview is a separate small asset; the variant matrix is loaded with the component but each variant's preview is fetched on hover.
- **Marketplace search results.** Paginated, 20 per page; images use `loading="lazy"` with `srcset` for density.
- **Previews on listing pages.** First frame is a static poster (WebP, ≤ 80 KB); the looping video is fetched on hover or after 500 ms idle.

### 8.3 Prop panel render budget

- 50 ms p95 / 100 ms p99 for any single prop panel render.
- A panel is rendered into a hidden `OffscreenCanvas` first, then mounted into the DOM only if the budget is met; otherwise the panel renders in "minimal" mode (no previews, no live preview) and the user sees a "Reduced experience" notice.
- Schema is pre-parsed and indexed at component load; per-prop render uses a virtualized list when > 20 props.

### 8.4 Marketplace indexing

- A listing is enqueued for indexing immediately on publish; the indexer (Kafka-backed) processes at ≥ 200 listings/sec sustained (NFR-COM-7).
- The indexer runs trigram + synonym + perceptual-hash indexing in parallel; an index entry is searchable within 60 seconds (NFR-COM-2).
- The search service is OpenSearch with a sharded index per language locale.
- A read-through cache (Redis) sits in front of the search service for hot queries (top 1% of queries serve 60% of traffic); cold queries fall through to OpenSearch.

---

## 9. Observability and Testing

### 9.1 Observability

**Logs.** Every component install, update, uninstall, marketplace purchase, refund, and brand-lock violation emits a structured log (`event`, `actor_id`, `workspace_id`, `listing_id|catalog_id`, `version`, `trace_id`). Logs are shipped to the centralized log store with a 30-day retention floor.

**Metrics.** Prometheus-format metrics, with at minimum:

- `component_installs_total{workspace_id, source}` (counter)
- `component_install_duration_seconds` (histogram)
- `marketplace_search_latency_seconds{result_count_bucket}` (histogram)
- `prop_panel_render_duration_seconds` (histogram)
- `variant_switch_duration_seconds` (histogram)
- `license_verification_failures_total{reason}` (counter)
- `team_library_event_apply_duration_seconds` (histogram)
- `brand_lock_violation_total{scope, strictness}` (counter)
- `schema_validation_failures_total{component_id, prop_key}` (counter)

**Traces.** OpenTelemetry traces for every registry, marketplace, and license request. Spans for: install pipeline (manifest fetch → hash verify → signature verify → license check → cache install), prop validation, team-library event apply.

**Alerts.**

- Install error rate > 1% over 5 min → page on-call.
- Marketplace search p95 > 800 ms over 5 min → page on-call.
- License verification failures > 0.5% over 5 min → page on-call + auto-freeze new installs (kill switch).
- Brand-lock violation rate > 0.1% of edits over 5 min → notify workspace admins.
- Component bundle hash mismatch → page on-call (suggests CDN tampering or replication bug).

### 9.2 Testing for this domain

**Unit (target ≥ 80% line coverage on registry, props, and template modules):**

- Prop schema engine — every JSON Schema construct plus every Domio-specific extension. A fixture suite covers valid + invalid + boundary cases per component kind.
- Component resolver — semver ranges, dependency cycles (must error cleanly), pin precedence.
- License token verifier — signature, expiry, revocation, seat count.
- Brand-lock enforcement — every (scope, strictness, allowed_overrides) combination.

**Integration:**

- Registry service ↔ object store — install/uninstall round-trip with hash verification.
- Marketplace service ↔ payment provider (Stripe test mode + bKash sandbox) — order creation, refund, payout ledger.
- Team library sync — multi-subscriber concurrent apply, offline replay, conflict resolution.

**End-to-end (Playwright):**

- A creator publishes a listing; a buyer installs it; the buyer sees the component in the insert panel; inserting it renders correctly; the seller sees the install in their dashboard.
- A user promotes a selection to a component; the component appears in My library; inserting it in another deck works.
- A team library update propagates to subscribers within 60 seconds.

**Visual regression.** Storybook-style tests for every shipped component, with snapshots at 4 sizes (sm/md/lg/xl) and 3 themes (light/dark/brand). Snapshots are diffed on every PR; reviewers must approve any visual change.

**Property tests.** Fast-check-driven tests for the resolver and the prop engine — randomly generated component graphs and prop schemas must round-trip without throwing.

**Performance tests.** k6 scripts that simulate 100 concurrent installs against a staging registry; budgets are enforced in CI on a nightly schedule.

**Security tests.**

- Signed-package verification — try to install a tampered package; must reject.
- CSP enforcement — try to inject a script via a Lottie file; must strip.
- License fuzzing — try to install with a forged license token; must reject.

---

## 10. Cross-Section Ties

### 10.1 To section 1 — Editor & canvas (features 1–22)

- **Auto-layout (feature 7)** absorbs inserted components without breaking the layout. Section 2 ships a `layout_intent` field on every component (`{ reflow: "fill" | "hug" | "fixed" }`) so the auto-layout system knows whether to stretch, hug, or pin dimensions.
- **Constraints (feature 8)** interact with brand-locked regions: a locked region pins its children; constraints on locked children are immutable.
- **Multiplayer (feature 17)** broadcasts prop edits as CRDT ops; the registry service never sees prop edits, only installs/updates.
- **Offline (feature 21)** guarantees installed bundles are available for 30+ days offline (NFR-COM-11).
- **Version history (feature 20)** captures prop edits as discrete checkpoints; the timeline UI labels them as "KPI value: 42 → 45" using the prop schema's `title`.
- **Semantic addressing (feature 226)** uses component catalog IDs as the stable address for `insert_component` and `pin_component_version` calls.

### 10.2 To section 3 — Theming, branding & design systems (features 37–47)

- Components inherit the active theme via design tokens (feature 37); a component missing a token renders with the `theme-degraded` badge.
- Theme marketplace (feature 45) reuses the marketplace service infra (§4.4) and the same listing/payout flows.
- Brand kit (feature 39) applies on template install: a template that targets Brand A renders correctly in a workspace configured for Brand B with no manual remapping.
- Brand extraction (feature 40) uses component prop schemas to propose prop defaults when it generates a new layout.
- Style linting (feature 46) consumes the brand-locked region table to know which regions to skip linting.

### 10.3 To section 4 — Live data & interactive charts (features 48–64)

- A smart component prop can be `dataBinding` typed (see §4.2 example). Bindings survive component version updates because the prop key is stable.
- Cross-chart filtering (feature 52) uses the same component instance addressing; multiple smart components on a slide can share a `filterProp` to participate in dashboard-style filtering.
- Scenario switcher (feature 57) binds to component props via the `dataBinding` prop with `kind = "scenario"`.
- Live data connections (feature 48) validate the bound field's type against the component prop's JSON Schema before persisting the binding.

### 10.4 To section 8 — AI Copilot (features 108–125)

- AI slide designer (feature 111) and AI redesign (feature 112) output slides composed of smart components chosen from the catalog; they read prop schemas to fill defaults.
- Copy assistant (feature 113) operates on string-typed props; it sees the `maxLength` constraint and respects it.
- AI layout repair (feature 121) can replace an overflowing free-form text with a smart "kpi-card" component, prompting the user before binding the data.
- Smart summarization (feature 119) reads prop schemas to compose a structured summary of what's on each slide.
- Accessibility AI (feature 122) uses the prop schema to generate meaningful alt text for asset-typed props.

### 10.5 To section 16 — Agentic & programmable interfaces (features 221–235)

- **MCP tool surface (features 221, 222):** every registry/marketplace endpoint has an MCP tool equivalent (§6.7).
- **Typed props for tool calling (feature 233):** the prop schema engine is the same JSON Schema used by `get_component_props_schema`. An agent performing structured output for `KPI value = 42` against a stat-card calls `describe_component` to fetch the schema, then emits the validated JSON.
- **Agent-scoped permissions (feature 225):** an MCP session's token carries a `cannot_touch_brand_locked_regions` claim; the registry service rejects any `apply_template` call that targets a locked region unless the token also carries `brand_lock_bypass: true` (workspace-admin-scoped).
- **Tool-call audit (feature 227):** every registry/marketplace write initiated via MCP is logged with `originator_kind = 'agent'` and the agent's identifier, visible in version history.
- **Dry-run mode (feature 228):** `apply_template` and `install_component` accept a `dry_run: true` flag; the registry returns the proposed diff for human approval without mutating state.
- **Semantic addressing (feature 226):** MCP tool calls reference components by `catalog_id` (stable across versions) and instances by `deck_id` + `element_id` (stable across slide reorderings).
- **Agent lint (feature 237):** `lint_deck` tool invokes the same brand-lint (feature 46) and accessibility (feature 122) checks; an agent about to finalize a deck runs this as the last step.
- **Natural-language patch (feature 234):** the higher-level `POST /decks/{id}/patch` endpoint decomposes to one or more MCP tool calls; the marketplace tools above are part of that surface.
- **Local-first SDK (feature 232):** the prop schema engine is pure-Rust with WASM bindings, so it runs identically in the SaaS backend, the headless rendering service, and the local SDK — guaranteeing that an offline agent validates props the same way as the server.

---

## Appendix A — Worked Example: Installing a Paid Stat Card

A concrete trace of the install flow to anchor the design above.

1. **Browse.** Buyer opens Insert → Marketplace, searches "KPI card," filters to `use_case = "board reports"`, `price < $20`. The page returns 14 results in 280 ms (warm cache).
2. **Inspect.** Buyer clicks the "Stat Card Pro" listing. The listing page shows a live preview, a "what's included" manifest (1 component, 2 variants, includes license for 5 seats), reviews, and price.
3. **Purchase.** Buyer clicks "Add to library." The marketplace service charges via Stripe; on success it writes a `license_grant` row, signs a license JWT, and enqueues a `payout.eligible` revenue-share event for the seller.
4. **Install.** The client calls `POST /v1/components/stat-card-pro/install`. The registry verifies the license JWT, generates an `install_id`, returns the package hash and version. The client fetches the encrypted tarball from the CDN with the per-grant decryption key, decrypts, verifies content hash, verifies Ed25519 signature against the seller's public key, validates the props schema parses, then mounts the component into "My library."
5. **Insert.** Buyer drags the component onto a slide. Auto-layout absorbs it; the Props panel opens with a typed form (KPI value, label, trend, trend delta, icon, size, variant). Buyer types `1240000`, the canvas updates within 16 ms.
6. **Update.** Seller publishes version 2.1.0 with new props. The buyer's decks containing an instance show an "Update available" badge. Buyer clicks "Update all" — the registry reapplies the version with a migration script declared by the publisher, preserving overrides.
7. **Refund (boundary case).** Buyer requests a refund within 5 days; usage is < 5 inserts. Refund flow decrements the seller's pending payout and marks the license grant `status='refunded'`. Subsequent renders of the component (in any saved deck) display "License refunded — please replace or re-purchase" but don't delete the data.

---

## Appendix B — Worked Example: Brand-Locked Template with Smart Components

A concrete trace for a template with locked regions, smart component props, and an MCP agent.

1. **Template.** A workspace admin creates a "Board Report" full-deck template with three brand-locked regions: the cover slide, the executive summary slide, and the disclaimer footer on every slide.
2. **Smart component.** The "Executive Summary" slide contains a `keyMetrics` smart component with props `{ metric, value, trend, trendValue }`.
3. **Publish.** Admin publishes the template to the team library; subscribers see it with lock badges.
4. **Use.** A subscriber inserts the template into a new deck; locks transfer. They edit `keyMetrics.value` from `124` to `130` via the typed form. The form respects a max value of `999` declared in the schema.
5. **Lock attempt.** The subscriber tries to drag the cover slide's logo. The drag is rejected client-side with "Region brand-locked — request access from admin." The action is also blocked server-side via the same selectors, with an audit row.
6. **Agent.** An MCP agent invoked via `apply_template` to a deck where one slide overlaps a locked region: the call returns `ERR_BRAND_LOCK` with the offending selectors; the agent retries after applying to the non-locked slides only.
7. **Admin override.** Admin promotes a designer to "lock-bypass" for the cover region only. The designer can edit; the bypass is recorded in the audit log.

---

_End of Section 2 — Components & Template Ecosystem._