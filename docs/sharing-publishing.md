# Section 11 — Sharing, Publishing & the Deck-as-a-Website (Features 155–168)

> **Source:** `feature-list.md` §11, `pre-development-planning-guide.md` (full document, applied contextually).
> **Status:** Planning document — no code, no commits.

Section 11 turns the deck from a file you hand around into a **first-class addressable surface on the public web**. Every published deck is a URL; every URL is a policy; every policy has a renderer, a watermark, an analytics plane, and a propagation hook. This document covers features 155–168 end-to-end: feature mapping, UX flows, functional & non-functional requirements, architecture, data model, API contracts, security, performance, observability/testing, and cross-section ties.

---

## 1. Feature-by-Feature Mapping (155–168)

Each entry has: **acceptance criteria**, **behavioral details**, and **edge cases**.

### 155. Every deck is a responsive web page with its own URL

**Acceptance criteria**
- A `POST /shares` on any deck returns a stable URL of the form `https://{host}/{workspace}/{deck-slug}-{8char}` (slug is editable; 8-char token is the immutable id).
- The URL resolves on **mobile (≥360px), tablet (≥768px), and desktop (≥1280px)** with no horizontal scroll, no overflow, and a max 100ms first input delay.
- Loading the URL does **not** require any plugin, browser extension, app install, or login by default.
- Lighthouse mobile score ≥ 90; LCP ≤ 2.0s on a Moto G4 / Slow 4G profile.

**Behavioral details**
- URL is owned by the **share service**, not the editor. The editor's `deck_id` and the share's `link_id` are decoupled — deleting a deck does not break the URL until the share itself is revoked.
- Routing is edge-routed: `/d/{link_id}/...` is the canonical share route; `/decks/{deck_id}` is the editor route.
- The renderer is a **single-page web app** that hydrates the minimal frame, then lazy-loads per-slide bundles by chunk.

**Edge cases**
- Deck renamed after share → URL stable; title in `<title>` and OG tags update on next render (cache-busted on `version_id`).
- Workspace deleted with active shares → links fall back to a 410 Gone page that explains the deletion and offers a cached snapshot if `retain_snapshot_on_workspace_delete=true`.
- Brand contains an emoji that breaks certain OS font stacks → render with a `<picture>` fallback to a stable webfont.

---

### 156. Scroll mode (scrollytelling async reading)

**Acceptance criteria**
- A toggle on the share dialog renders the deck as a vertical scrollytelling page: each slide is a full-width section, sticky scrollytelling components where configured, with scroll progress driving animations defined in section 6 (#90).
- Scroll FPS ≥ 55 on a 2020-era MacBook Air, ≥ 30 on mid-tier Android.
- Slide state persists in the URL hash (`#s=4&t=12s`) so a reader can deep-link to a moment.
- Reduced-motion preference (`prefers-reduced-motion`) auto-disables scroll-linked animations per #93.

**Behavioral details**
- The editor annotates each slide with an optional `scroll_choreography` (scroll-pinned elements, parallax layers, sticky captions) authored in the timeline editor (#85–#90).
- The renderer uses an **IntersectionObserver-driven stage**: only the active slide and its ±1 neighbors are mounted; the rest are detached and held in memory as serialized state.
- A **reading progress bar** and **TOC rail** (auto-generated from slide titles) are rendered as accessibility aids.
- Code-split per slide; total JS for a 50-slide deck on first paint ≤ 180 KB gzipped.

**Edge cases**
- Slide contains a 3D model (#65–#69) → in scroll mode, falls back to a poster image + click-to-load; the 3D model only hydrates on intent (avoids 3D context exhaustion on mobile).
- Slide contains an interactive form (#101) → in scroll mode, the form renders inline but is gated by "Submit requires opening the interactive view" so its parent state isn't lost.
- Long deck (>200 slides) → virtualized rendering, lazy chunk load; browser back/forward restores prior scroll position via sessionStorage.

---

### 157. Password / domain-restricted / SSO / public sharing levels

**Acceptance criteria**
- Sharing levels: `public`, `password`, `domain_restricted` (email domain allowlist), `sso` (workspace SSO or external IdP), `request_access` (email gate with owner approval).
- Level is set per link; same deck can have multiple links at different levels.
- A `POST /shares/{id}/policy` changes the level with no URL change for `link_id`; the signed-token rotates and is re-issued.

**Behavioral details**
- The **access policy engine** evaluates a request as: `link_status==active && policy.allows(claims) && expiry>now && quota_within_budget && geo_allowlist(if set)`.
- For `domain_restricted`: the viewer's email is captured at first contact (passwordless magic link if needed) and re-asserted via signed session cookie (15-min sliding window).
- For `sso`: an OIDC redirect dance through the workspace's configured IdP; for external IdP, an `OIDC_TRUST` config on the link.
- The owner sees a live "who has access" panel listing effective policies + a count of currently valid sessions.

**Edge cases**
- A viewer arrives at a `password`-protected link, types wrong password 5× → soft lockout (1 min) and an email to owner; rate limit is per-IP AND per-email-cookie.
- A `domain_restricted` link shared with `acme.com`, viewer signs in with `joe@acme.com` → access granted; later claims from `joe@gmail.com` on same browser → denied, prompt to sign in with allowed domain.
- SSO IdP outage → link degrades to a friendly "identity provider unavailable, try again" page with exponential backoff; never silently fails open.

---

### 158. Expiring links and per-viewer watermarking for confidential decks

**Acceptance criteria**
- Links can have an `expires_at` (absolute) or `max_views` or both. Once either is exhausted, the URL returns 410 Gone with an explanatory page.
- Watermarking is configurable per link: **none**, **visible-only**, **forensic-only**, **both**.
- Visible watermark shows the viewer's email + IP-derived short label + timestamp, tiled at ~15° rotation, ~8% opacity.
- Forensic watermark is invisible to the viewer but survives screenshots, screen-recording, and re-encoding (for at-rest exports too).

**Behavioral details**
- **Visible watermark** is a DOM/CSS overlay layer; resistant to "save as PDF" because it's rendered server-side into the per-viewer HTML response.
- **Forensic watermark** uses two channels:
  1. A **steganographic payload** embedded in rasterized asset responses (a per-viewer LSB pattern on images; a per-viewer DCT-modulation on video frames).
  2. A **per-viewer asset variant** — each viewer is served a uniquely fingerprinted build of vector-heavy slides so that even a screenshot of the rendered DOM is traceable.
- Watermark forensics is **non-destructive**: the shared deck's canonical assets are never modified; viewer-specific variants are derived and cached.
- Watermark profile (`watermark_profile`) is reusable across multiple links.

**Edge cases**
- Viewer disables JavaScript → visible watermark degrades to a server-rendered text overlay; forensic watermark still works (server-rendered variant is unique).
- Screen recording → forensic watermark survives; visible watermark survives unless the recorder does aggressive cropping (we mitigate by spreading watermark tiles outside the 95% central viewport).
- Expiry reached mid-session → 60s warning banner; then graceful termination to "this share has ended" page, preserving any in-flight form state in localStorage for 30s.

---

### 159. Per-link content control — investor version vs internal version from one deck

**Acceptance criteria**
- The deck author can attach **slide-level visibility rules** to a specific link: `{slide_id: visible|hidden|watermarked_only}`, with optional `{default_visible: false}` to make the link explicit-include.
- Author previews the link exactly as a recipient will see it (with watermark if configured) before sending.
- Same link URL across revisions; visibility rules update atomically with no URL change.

**Behavioral details**
- The `link_visibility_rule` is part of the **link policy**, evaluated by the access policy engine at render time.
- "Hidden" slides are not shipped to the viewer's browser at all (zero footprint in HTML/JS); this matters for confidential internal financial slides that must not be inferable from payload size.
- "Watermarked_only" slides are shipped but rendered with the watermark profile front-and-center (e.g., watermark covers 35% of the slide) for "you shouldn't be reading this, but if you do, we'll know."
- The editor shows a small **"this slide is hidden from link X"** badge on each slide, so authors don't accidentally overshare when revising.

**Edge cases**
- A `link_visibility_rule` references a slide that has since been deleted → rule is marked `orphaned`, surfaces in the owner dashboard, but is silently ignored at render time (no error to viewer).
- A recipient forwards a `password`-protected link with `default_visible: false` → recipient still has to enter password AND will not see slides the forwarder never explicitly included.
- A link is configured to hide slide 4, but a `magic_jump` deep link to slide 4 is opened → 404 from inside the renderer; the URL is intercepted and the viewer is rerouted to the nearest visible slide with a friendly notice.

---

### 160. Custom domains (deck.yourcompany.com) and white-label viewer

**Acceptance criteria**
- Owner can add a custom domain via a verification flow (DNS TXT or HTTP file challenge).
- Once verified, the domain serves the deck with full TLS (auto-issued via ACME, auto-renewed).
- White-label viewer: **logo, primary/secondary/accent colors, font family, favicon, loading copy, footer text** all customizable.
- Multiple domains can point to the same workspace with different themes.

**Behavioral details**
- **Custom domain manager** handles: domain verification, ACME DNS-01 challenge (via the workspace's DNS provider API, e.g., Cloudflare, Route53, or manual), certificate issuance, renewal at 30 days before expiry, and graceful re-issuance on private key compromise.
- **White-label theme** is a set of **design tokens** (CSS custom properties + a tiny bootstrap stylesheet) injected at viewer boot, overriding defaults.
- White-label tokens **cannot** alter structural layout (no layout-shift to other workspaces, no content re-ordering) — only color, type, logo, and copy.
- The share dialog previews the white-label viewer live in an iframe sandbox before the link is generated.

**Edge cases**
- ACME rate limit hit on a bulk-issued batch → exponential backoff per-domain; owner notified; manual intervention possible via dashboard.
- Custom domain DNS misconfigured → dashboard surfaces the exact missing record; viewer never serves a broken certificate (we don't proceed until ACME succeeds).
- White-label theme uses a font that fails to load → fallback to the workspace-default webfont; banner for the viewer ("This brand uses a custom font that couldn't load").
- White-label tokens contain `expression(...)` or XSS payloads → sanitized through a strict allowlist (CSS variables only, no `url()`, no `@import`).

---

### 161. Embeds anywhere (Notion, websites, docs) with live interactivity preserved

**Acceptance criteria**
- Owner can copy an **embed snippet**: `<iframe src="..." width="..." height="..." allow="..." sandbox="..."></iframe>`.
- The embed supports **live interactivity** — embedded viewers can click, filter, scroll, and toggle scenarios; the parent page does not have to handle any of it.
- A `?embed=1` URL flag activates embed-optimized chrome (no nav, no download buttons by default, etc.).
- Embeds work inside Notion, Confluence, Google Docs (via published-web iframe), WordPress, Ghost, Substack, Webflow, and arbitrary CMSes.

**Behavioral details**
- The **embed proxy** rewrites the renderer for embed context: minimal chrome, no top-nav, no export menu unless `&controls=1`.
- CSP is strict by default: `frame-ancestors` restricted to the workspace's allowlist OR an explicit `allowed_parents` list on the link.
- The iframe uses `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"` (and `allow-popups-to-escape-sandbox` for scenarios that need a new window).
- `postMessage` channel lets the parent page listen to events (`slide:change`, `interactive:complete`) and send commands (`slide:goto`, `scenario:set`) for bi-directional embed behavior.
- A **Notion-specific deep-link helper** (`notion://...`) is provided, plus a bookmarklet for sites that strip iframes.

**Edge cases**
- Embed host strips iframes (some Markdown renderers) → fallback to a `<noscript>` link + a JS-less image snapshot of slide 1.
- Parent page is on a denied domain → embed returns a 403 with a "this domain is not allowed to embed this deck" page (no leakage of the underlying deck).
- Interactive scenario causes an external popup → only allowed if the link's policy has `allow_external_links: true`; otherwise link is rewritten as a warning dialog.

---

### 162. Narrated auto-play — recorded voiceover plays the deck like a video, but it stays interactive

**Acceptance criteria**
- Author records a `narration_track` per slide (or uploads pre-recorded audio).
- A viewer with autoplay enabled sees the deck advance automatically in sync with the voiceover.
- Interactivity is preserved: viewers can pause, scrub, click hotspots, and toggle scenarios without losing narration sync.
- Honors `prefers-reduced-motion` and the browser's autoplay policy (muted-only autoplay by default).

**Behavioral details**
- The **narration runner** is a state machine: `playing | paused | scrubbing | interactive-pause | ended`. Slide transitions are time-anchored to narration cues; scrubbing snaps to nearest cue.
- Audio is streamed (HLS or DASH with chunked delivery) so large decks don't preload hundreds of MB.
- An **optional auto-generated waveform / chapter strip** is rendered along the bottom for navigation.
- Narration can be AI-generated from speaker notes (#116) or uploaded as a single track with per-slide cue points in the editor.
- Multiple language tracks supported (#113/#153); language selection is automatic based on `navigator.language` or explicit.

**Edge cases**
- Viewer mutes tab → narration continues; a muted banner is shown ("Narration playing — click to unmute").
- Scrubbing past cues → scrub-snaps to nearest cue; in-between playback continues normally after a 200ms resume guard to avoid audio glitching.
- Network stutter → runner buffers 5s ahead; if buffer underruns, switches to "narrated but paused" with re-sync on resume.
- Viewer on `prefers-reduced-motion` + `prefers-reduced-data` → audio continues but auto-advance is disabled; viewer must click to advance (preserves sync with audio).

---

### 163. Video export (MP4 with animations and narration)

**Acceptance criteria**
- Owner can request `POST /exports` with `{format: mp4, deck_id, options}` and get a job back.
- Job renders the deck as an MP4 with all section 6 animations baked in, optional narration track(s) mixed in, and a chosen resolution (720p / 1080p / 4K).
- Job status is observable via polling or webhook; final artifact is downloadable and storable on the owner's drive.
- MP4 honors the deck's `slide_timing` configuration (per-slide duration defaults) or an explicit timeline override.

**Behavioral details**
- The **export service** spins up a headless renderer (Chromium-based, parallelized per slide) that plays the deck on a virtual timeline, frames each animation key, captures frames via `MediaRecorder` or ffmpeg pipeline.
- Long exports (>5 min video, or 4K) go to a queue with priority lanes (`fast` / `standard` / `bulk`).
- Optional chapter markers (per-slide) and burned-in captions are supported.
- A **two-pass** render is used when narration is involved: first pass produces a dry-run timeline; second pass muxes audio with frame-accurate sync.

**Edge cases**
- 3D model on a slide → the renderer switches to a software-WebGL fallback (SwiftShader or angle-backend) so 3D still renders headlessly; cost: ~3× render time per 3D-heavy slide.
- Embed slide (#81) → embeds are replaced with a "click to view live" card snapshot at the slide's first frame; flagged in the export job's `degraded_slides` list.
- Author requests 4K but plan caps at 1080p → job is rejected with a clear `plan_limit_exceeded` error and an upsell CTA.

---

### 164. PDF / PPTX export with graceful degradation

**Acceptance criteria**
- `POST /exports` with `{format: pdf|pptx, deck_id, options}` returns a job.
- Interactive elements (forms, calculators, hotspots, scenarios) become **static snapshots** in the export, with a **QR code or link back to the live interactive version** printed at the bottom-right of each affected slide.
- Charts, animations, and live data are flattened to a "snapshot at export time" with a timestamp footer (`Snapshot taken YYYY-MM-DD HH:MM UTC`).

**Behavioral details**
- **PDF** export uses a vector-first pipeline (deck slides are SVG-native, so most text/shapes export losslessly), with images rasterized at 2× DPI.
- **PPTX** export uses OOXML shapes for vector and embeds high-DPI PNGs for rasterized parts; animations become slide-build order, not keyframes (PowerPoint limitation), with a "this animation is best viewed in the live version" notice on slides where degradation is severe.
- Both formats support a `print_handout` companion template (#167) bundled into the same export job.
- Both formats include a **metadata footer** on each slide: deck title, page number, optional confidentiality watermark, and the live link.

**Edge cases**
- Slide has an unresolvable external data binding (#48–#62) → exporter captures the **stale-data indicator** state (#63) and the snapshot timestamp, plus a note "data was unavailable at export time."
- Slide has a 3D model → flattened to a poster image; export job's `degraded_slides` list includes the slide.
- PPTX import in older PowerPoint versions → exporter runs a compatibility downgrade pass (no modern gradients, no SVG, no live video).

---

### 165. SEO-ready public decks (a conference talk that ranks on Google)

**Acceptance criteria**
- Each public deck generates a server-rendered HTML snapshot for crawlers with semantic markup: `<h1>` per slide title, structured JSON-LD `PresentationDigitalDocument` schema, `<meta>` and OG tags.
- A `sitemap.xml` is auto-generated per workspace, listing public decks with `<lastmod>` reflecting deck update time.
- A `robots.txt` allows crawling of public links and disallows private ones.

**Behavioral details**
- The **SEO service** listens to share-link creation/update events and pushes a server-rendered HTML artifact to a CDN edge keyed by URL.
- Internal links between slides within a deck are real `<a>` tags, not JS-only — crawlers can walk the deck.
- For non-public decks, the SEO service **never** ingests content; only a stub meta is served.

**Edge cases**
- Deck contains an interactive form (#101) → form is rendered as a static HTML form with `method=get` and an explanatory note; server-rendered snapshot respects no-JS.
- Author toggles a deck from public to password-protected → SEO snapshot is purged from CDN within 60s; sitemap updated; `noindex` meta emitted if a stale snapshot is requested before purge.
- A slide contains a private customer's name → the author can mark "exclude from SEO snapshot" on individual slides; those slides get `<meta name="robots" content="noindex">` per-slide.

---

### 166. Social preview cards auto-generated per deck and per slide

**Acceptance criteria**
- Each public deck has a 1200×630 OG card auto-generated from a meaningful composition of slides (title slide + chart or quote).
- Each slide has a per-slide OG card available at `/d/{link_id}/s/{slide_id}/og.png`, useful when a viewer shares a deep link.
- Twitter `summary_large_image`, LinkedIn, and Slack unfurl previews all render correctly.

**Behavioral details**
- The **social card generator** is a service that takes a deck + a target slide id and renders a 1200×630 PNG via the same headless renderer as exports (#163).
- Composition rules: pull the title slide if at deck level; pull the slide's main hero element (chart, quote, image) at slide level; apply brand color background; overlay title at 60% font size of card height.
- Cache the result on CDN keyed by `deck_version_id + slide_id + theme_id`; invalidation piggybacks on the export/CDN cache strategy.

**Edge cases**
- Slide is entirely blank → generator falls back to title-slide composition with the slide number.
- Brand contains a custom font that fails to load → falls back to workspace-default font; never produces broken text.
- Card generation is rate-limited per workspace to avoid abuse.

---

### 167. Print-optimized handout layouts (notes pages, 4-up grids)

**Acceptance criteria**
- Export dialog offers **handout layouts**: 1-up (one slide per page), 2-up (slides + notes per page), 3-up, 4-up, 6-up, 9-up, with optional lines for handwritten notes.
- Speaker notes auto-flow to the right of each slide in 2-up; below in 4-up; omitted in 6/9-up.
- Print profile respects printer color profile (CMYK-friendly palette conversion option for offset printing).

**Behavioral details**
- The **print layout service** uses CSS `@page` rules and a per-page handout template (`handout_template`) to compose slides into PDF.
- Per-slide notes are pulled from `#116` (AI-generated notes) or the author's manual notes; the export dialog lets the author preview before commit.
- A per-page QR code linking back to the live, interactive slide is optional but on by default.

**Edge cases**
- Speaker notes exceed page space → truncate with a "full notes at {live-link}" footer; never silently cut off mid-sentence.
- Slide is non-16:9 → handout layout centers the slide on a 16:9 page; whitespace balanced top/bottom.

---

### 168. Deck update propagation — fix a typo once, every shared link is already correct

**Acceptance criteria**
- Editing a deck that has N active share links does **not** require re-sending any link.
- Viewers who reload a shared link see the updated deck (subject to their `version_pin` setting on the link).
- A new `deck_version_id` is created on each edit; share links reference the deck id but the renderer reads `latest_version` by default.
- Links can optionally pin to a specific version (useful for "as-of-this-quarter" board snapshots).

**Behavioral details**
- The **update propagation event bus** emits `deck.updated` on every save (autosave is per-keystroke per #22, but version-bumps are debounced at ~2s of inactivity to coalesce).
- The renderer subscribes to `deck.updated` via a long-poll / SSE channel scoped to `(workspace_id, deck_id)`; on receipt, the active view re-fetches the slide's serialized state and re-hydrates.
- CDN-cached SEO snapshots (#165) and social cards (#166) are invalidated within 5s of `deck.updated`.
- The export service (#163/#164) is **not** affected — exports always pin to the version they were triggered against.

**Edge cases**
- Viewer is mid-interaction (filling a form, toggling a scenario) → the rehydration is queued until interaction completes; UI shows a subtle "deck updated, refresh to view" pill.
- Edit is incompatible with the live renderer's contract (e.g., a removed slide the viewer is on) → viewer is gracefully bounced to the nearest valid slide with an info notice.
- Many edits in rapid succession → debounced; the active viewer sees a single rehydration, not N thrashes.

---

## 2. UX Flows

### 2.1 Generating a share link

```
[Editor] "Share" button → modal opens:
  Step 1 — Audience & access level
    [Public] [Password] [Domain-restricted] [SSO] [Request access]
  Step 2 — Content scope (per-link visibility rules)
    [All slides ▾]   → "Customize which slides are visible on this link"
    List of slides with checkboxes; preview pane on right
  Step 3 — Watermark & expiry
    [None ▾]   [Visible] [Forensic] [Both]
    [Never expires ▾]   [Expires at...]   [Max views: ...]
  Step 4 — White-label & domain (if set up)
    [Default viewer]   [domain.yourcompany.com]   [White-label theme]
  Step 5 — Copy link / embed code / export
    [Copy URL] [Copy embed <iframe>] [Send via email] [Generate video]
  → All steps save a single draft in localStorage so navigating away doesn't lose work.
```

**Empty state:** No prior shares → big CTA "Share your deck"; tooltip "Every deck gets its own URL — pick who can see it."

**Error states:**
- Watermark profile missing required asset → red banner, "Watermark can't be applied because…"
- Custom domain not yet verified → yellow banner, link generation allowed but flag badge: "Live on custom domain when verification completes."
- SSO IdP not configured → level option disabled with tooltip.

---

### 2.2 Configuring access levels (deep view)

- **Public** → no extra fields. Toggle for "Allow indexing (SEO)" → on by default.
- **Password** → password field (with strength meter); "Set password reminder"; "Notify viewers of password changes" toggle.
- **Domain-restricted** → email domain list (`@acme.com, @acme.io`); "Send magic link to verify domain" optional.
- **SSO** → IdP select (workspace's configured + "external OIDC"); "Require re-auth every X minutes" slider.
- **Request access** → owner email for notifications; auto-approve allowlist (optional).

---

### 2.3 Applying per-slide visibility rules per link

The visibility editor is a slide-list sidebar. Each row has:
- Slide thumbnail
- Title
- Toggle: `Visible | Hidden | Watermarked-only`
- Per-rule "Apply to all child elements?" (rare; mostly for slides with sub-components)
- Search/filter

A **Preview as recipient** button opens a sandboxed tab rendering the exact experience (including watermark), without leaving a trace in analytics.

**Conflict warnings:**
- A slide that's `watermarked_only` but the link has no watermark profile → "this rule needs a watermark profile to mean anything."
- A slide that's `hidden` but is the target of a `magic_jump` URL elsewhere → "this URL won't work for this link."

---

### 2.4 Scroll mode preview

The editor's **Share → Preview** tab offers two modes:
1. **Standard** (slide-by-slide, presenter-style)
2. **Scroll mode** (vertical scroll, scrollytelling)

Preview reflects all per-link rules, watermarks, and white-label theming. A toggle "Scroll progress in URL hash" controls deep-linking. Preview includes a top toolbar:
- `[S] Standard mode` `[L] Scroll mode` `[↻] Reset scroll` `[⛶] Fullscreen`
- `[?] Keyboard shortcuts` (e.g., `j/k` to next/prev slide, `g g` to top, `?` for help).

---

### 2.5 Embedding in Notion

1. Author copies the embed snippet from the share dialog.
2. In Notion, `/embed` → paste URL → Notion auto-detects the iframe.
3. Notion sometimes strips iframes → fallback helper: paste as **bookmark** → click "Convert to embed" via the Domio Notion app (OAuth).
4. Notion's iframe renders the Domio embed; interactivity preserved.
5. Power-user: paste `<iframe>` directly into a Notion code block for fine-grained sizing.

**Cross-origin note:** Notion's domain must be in the link's `allowed_parents` allowlist (set per-link), otherwise the embed returns 403 with a clear "ask the deck owner to allow embedding on notion.com."

---

### 2.6 Narrating autoplay

In the editor: slide → "Record narration" → microphone permission → record per-slide. Or upload pre-recorded audio and add cue points in the timeline editor. The share dialog exposes:
- **Autoplay** toggle (on by default for narrated links; off for un-narrated)
- **Caption language** dropdown (auto = `navigator.language`)
- **Reduced-motion respect** toggle (on by default)
- **End screen** config (loop / pause / link to next deck)

The viewer, when narration is present, shows a small audio-player chrome (play/pause, scrubber, chapter dots, volume, captions toggle). Interaction during narration: clicking a hotspot **pauses narration briefly** (200ms), plays the click feedback, then resumes — feels natural.

---

### 2.7 Exporting video / PDF / PPTX

```
[Share] → [Export] tab → choose format:
  Video (MP4):
    Resolution [720p | 1080p | 4K]   FPS [24 | 30 | 60]
    Include narration? [Yes | No | Select track]
    Include burned-in captions? [Yes | No]
    Estimated time: X min  Cost: Y credits
  PDF:
    Page size [A4 | Letter | Custom]
    Layout [1-up | 2-up (with notes) | 4-up | 6-up]
    Include live-version QR? [Yes | No]
  PPTX:
    Compatibility [PowerPoint 2019+ | 2021+ | 365]
    Include notes? [Yes | No]
    Embed fonts? [Yes | No — uses standard fonts]
    Include live-version QR? [Yes | No]
  → "Queue export" → background progress → notification on completion → download or "save to drive"
```

**Long-job UX:** Export dialog shows estimated time, progress bar with frame-by-frame updates (via SSE), and a "this is taking longer than usual — here's why" tooltip. If the queue is overloaded, user gets the option to schedule for off-peak.

---

## 3. Functional & Non-Functional Requirements

### 3.1 Deck-as-website renderer

| Aspect | Requirement |
|---|---|
| First-party responsive | Mobile-first, breakpoints at 360/768/1024/1280/1920 |
| Low-bandwidth | Total JS for first paint ≤ 90 KB gzipped; per-slide bundle ≤ 25 KB gzipped average |
| Mobile-first | Touch-friendly (44px tap targets), gestures (swipe between slides), no hover-only affordances |
| Reduced data | Image lazy-load, AVIF/WebP with JPEG fallback, `loading="lazy"` |
| Browser support | Last 2 versions of Chrome/Safari/Edge/Firefox; iOS Safari 16+, Android Chrome 110+; graceful degradation for older |
| Accessibility | WCAG 2.1 AA target; full keyboard nav; ARIA landmarks per slide |
| Offline (read-only) | Service Worker caches the active deck's HTML + assets for 30 days; refreshed on each new view |

### 3.2 Scroll-mode rendering performance

- 60fps target on desktop, 30fps on mid-tier mobile (with reduced-motion fallback to 24fps).
- Only active slide + neighbors mounted; `content-visibility: auto` and `contain-intrinsic-size` to avoid layout thrash.
- `IntersectionObserver` + `requestAnimationFrame` coalescing for scroll-linked animations.
- Asset preloading priority: above-fold slide text (highest) → slide images → audio narration chunks → 3D models (last).

### 3.3 Access control

| Level | Mechanism | Token TTL |
|---|---|---|
| public | signed URL only | 24h refresh on access |
| password | signed URL + bcrypt-hashed password cookie | 30d session |
| domain_restricted | email-capture + domain-claim cookie | 15m sliding |
| sso | OIDC assertion → short-lived session cookie | 60m |
| request_access | owner-approved allowlist | 90d |

### 3.4 Expiring link generation

- `expires_at` enforced server-side at request entry; no client-side trust.
- `max_views` counter increments atomically on first authenticated view (subsequent views within the same session don't re-increment).
- Both fields are part of the link policy, immutable in audit log, but `expires_at` can be extended by the owner (audit-logged).
- Soft-delete vs. hard-delete: by default, expired links return 410 Gone with a cached snapshot for 30 days; then hard-deleted.

### 3.5 Per-viewer watermarking

- **Forensic** runs as a post-process on every per-viewer HTML response and asset response.
- **Visible** is server-rendered into the HTML at response time (not a CSS overlay that can be removed via DevTools).
- Watermark profile includes: text template (e.g., `{email} • {ip_short} • {ts}`), opacity, rotation, tile density, font, color, channel selection (`image-steg | dct-mod | both`).
- For 4K video exports with watermark, forensic watermark is also burned in (DCT-modulated per-frame pattern in the luma channel).

### 3.6 Custom domain mapping (CNAME + TLS automation)

- Verification: DNS TXT (`domio-verify={token}`) OR HTTP file challenge (`/.well-known/domio-verify/{token}`).
- TLS via **ACME DNS-01** (preferred — works behind CDN) or HTTP-01 (fallback).
- Cert-manager-compatible: a `Certificate` CRD per domain with renewal at 30d before expiry.
- Issuance is parallelized but rate-limited (LE has a 50 certs/week per domain cap).
- Certs stored encrypted at rest; private keys never leave the secret store.

### 3.7 White-label viewer (theming tokens)

- Tokens are CSS custom properties (`--brand-primary`, `--brand-on-primary`, `--brand-font-display`, `--brand-font-body`, etc.).
- Token set is JSON-validated against an allowlist schema (no `expression()`, no `url()`, no `@import`, no `behavior:`, etc.).
- Tokens injected at `<head>` parse time; default theme can never be fully overridden — a baseline set is always present to ensure structural integrity.

### 3.8 Embed iframe sandboxing

- `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox allow-downloads"` (downloads only when the link allows).
- CSP on the embed response: `frame-ancestors` set from the link's `allowed_parents` list; `default-src 'self' cdn.domio.io; script-src 'self' 'sha256-...';` etc.
- `Permissions-Policy` to opt-in features (`camera`, `microphone`, `clipboard-read`) per link.
- Embed does **not** carry the owner's auth cookies; it's a separate session, optionally federated via `postMessage`.

### 3.9 Narrated autoplay

- Audio streamed via HLS (good CDN support, fine-grained chunks).
- Time-sync accuracy: ±50ms via `HTMLMediaElement.currentTime` reconciliation every cue point.
- Chapter strip auto-generated from cue points; click to seek.
- Optional captions sidecar (WebVTT) generated from speech-to-text or author-uploaded.

### 3.10 Video export

- Container: MP4 (H.264 + AAC) by default; AV1 / HEVC optional for 4K.
- Bitrate: adaptive by resolution (e.g., 1080p = 6 Mbps video + 192 kbps audio).
- Resolution: 720p, 1080p, 4K.
- Length: no hard cap; queue and storage sized for 30-min exports (common conference-length talk).
- Two-pass for narration sync; single-pass otherwise.

### 3.11 PDF/PPTX export with graceful degradation

- PDF: vector-first, image fallback at 2× DPI; PDF/UA tagged for accessibility.
- PPTX: OOXML shapes for vector; PNGs for raster; animations converted to slide-build order; degrade notices baked into notes.
- Both include: snapshot timestamp, deck title, page numbers, optional confidentiality watermark, optional QR-to-live link.

### 3.12 SEO metadata

- JSON-LD: `schema.org/PresentationDigitalDocument` with `author`, `datePublished`, `dateModified`, `slideCount`, `about` (if available).
- Per-slide semantic markup: `<article>` per slide with `<h1>`, `<h2>`, `<p>`, `<figure>`.
- Canonical URL on every page; `og:url`, `og:title`, `og:description`, `og:image`, `twitter:card="summary_large_image"`.

### 3.13 Social preview cards

- 1200×630 PNG/JPG at deck level; 1200×630 at slide level.
- Composition algorithm: title slide + chart/quote + brand background.
- Cached on CDN; invalidated via the same propagation event bus.

### 3.14 Print handout layout

- Templates: 1-up, 2-up (with notes right), 4-up (notes below), 6-up, 9-up.
- Lines for handwritten notes: 2-up default, optional elsewhere.
- QR-to-live-link on every page when enabled.

### 3.15 Update propagation

- Event bus topic: `deck.updated`, payload `{deck_id, version_id, actor, ts}`.
- Renderer subscribes via SSE; on event, rehydrates active view (debounced 1s on the renderer side).
- SEO snapshots and social cards invalidated within 5s.
- Exports remain version-pinned.

---

## 4. Architecture

### 4.1 Component map

```
            ┌──────────────────────────┐
            │      Editor (sec 1)       │
            └─────────────┬────────────┘
                          │ share request
                          ▼
   ┌────────────────────────────────────────────────┐
   │              Share Service                      │
   │  (link generator, policy CRUD, lifecycle)       │
   └─────────┬──────────┬──────────┬─────────┬───────┘
             │          │          │         │
             ▼          ▼          ▼         ▼
   ┌──────────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐
   │  Link        │ │ Access   │ │ Water- │ │ Custom       │
   │  Generator   │ │ Policy   │ │ mark   │ │ Domain       │
   │              │ │ Engine   │ │ Service│ │ Manager      │
   └──────────────┘ └──────────┘ └────────┘ └──────┬───────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │  ACME / TLS      │
                                          │  (cert-manager)  │
                                          └──────────────────┘

   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ White-label      │  │ Embed Proxy      │  │ Narration        │
   │ Theme Pipeline   │  │ (CSP, sandbox)   │  │ Runner           │
   └──────────────────┘  └──────────────────┘  └──────────────────┘

   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ Export Service   │  │ SEO Service      │  │ Social Card      │
   │ (video/PDF/PPTX) │  │ (snapshots)      │  │ Generator       │
   └──────────────────┘  └──────────────────┘  └──────────────────┘

   ┌──────────────────┐  ┌──────────────────────────────────────┐
   │ Print Layout     │  │ Update Propagation Event Bus        │
   │ Service          │  │ (deck.updated → CDN invalidate,      │
   └──────────────────┘  │  renderer rehydrate)                  │
                         └──────────────────────────────────────┘
```

### 4.2 Service responsibilities

| Service | Responsibilities |
|---|---|
| **Share Service** | CRUD on `share_link`; orchestrates policy, watermark, domain, theme on link creation; audit-logged |
| **Link Generator** | Mint signed tokens (HMAC-SHA256 over `link_id + expiry + viewer_claims`); produces short ids; supports QR generation |
| **Access Policy Engine** | Single decision point: `evaluate(request) → allow|deny|challenge`; handles all five access levels; idempotent |
| **Watermark Service** | Generates per-viewer asset variants; embeds steg + DCT-mod; visible overlay text |
| **Custom Domain Manager** | DNS verification, ACME DNS-01, cert issuance/renewal, TLS provisioning, monitoring |
| **White-label Theme Pipeline** | Token validation, sanitization, CSS generation, theme bundling per link |
| **Embed Proxy** | Edge-routed embed rendering with strict CSP, sandbox, allowed-parents enforcement |
| **Narration Runner** | Client-side state machine; audio streaming; cue-point anchoring; chapter UI |
| **Export Service** | Job queue, headless render, MP4/PDF/PPTX generation, graceful degradation pass, artifact storage |
| **SEO Service** | Server-rendered HTML snapshots, sitemap, robots.txt, schema.org JSON-LD |
| **Social Card Generator** | PNG composition for OG cards (deck and per-slide), CDN cached |
| **Print Layout Service** | PDF handout composition with per-page QR codes |
| **Update Propagation Event Bus** | Publishes `deck.updated`, `link.updated`, `domain.verified`, etc.; CDN invalidation hooks; renderer SSE |

### 4.3 Module boundaries (if monolith-first)

Even in a modular monolith, these live as distinct bounded contexts with their own tables, services, and event publishers:

- `shares` (links + policies)
- `watermarks` (profiles + jobs)
- `domains` (custom domains + certs)
- `themes` (white-label tokens)
- `embed` (embed configs + parent allowlist)
- `narration` (tracks + cues)
- `exports` (jobs + artifacts)
- `seo` (snapshots + sitemaps)
- `social` (cards)
- `print` (handout templates)
- `propagation` (event bus, cache invalidation)

This shape makes it trivial to peel services off later if scaling or compliance requires.

### 4.4 Communication patterns

| Interaction | Pattern | Rationale |
|---|---|---|
| Editor → Share Service | Sync REST | Editor needs immediate confirmation |
| Renderer → Access Policy Engine | Sync (edge-local) | Sub-50ms decision; cache hot |
| Watermark Service ↔ Asset Service | Async via queue | Heavy CPU; backpressure-aware |
| Export Service ↔ Headless Renderer | Async via queue | Long-running, retries needed |
| Renderer ← Update Propagation | SSE / WebSocket | Push model, low-latency |
| Export Service → CDN | Async via event bus | Decoupled invalidation |
| Custom Domain Manager ↔ ACME | Sync per-domain (parallelized) | Bounded by LE rate limits |

### 4.5 Storage choice

- **Primary store:** Postgres (relational — links, policies, audit logs, user-claims).
- **Cache:** Redis (signed tokens, session cookies, policy decisions, hot asset variants).
- **Object store:** S3-compatible (export artifacts, social cards, per-viewer asset variants).
- **Search:** OpenSearch (audit log search, admin queries).
- **Event bus:** NATS or Kafka (depends on existing infra; either works).
- **CDN:** any edge CDN (Cloudflare, Fastly, CloudFront) — this is where the renderer is served from.

---

## 5. Data Model

> Schemas are illustrative — field names and shapes align with the architecture above.

### `share_link`

```sql
CREATE TABLE share_link (
  id                UUID PRIMARY KEY,
  workspace_id      UUID NOT NULL,
  deck_id           UUID NOT NULL,
  short_id          CHAR(8) UNIQUE NOT NULL,        -- public-facing id
  pinned_version_id UUID,                            -- NULL = latest
  status            TEXT NOT NULL DEFAULT 'active', -- active|expired|revoked
  expires_at        TIMESTAMPTZ,                     -- NULL = never
  max_views         INT,                             -- NULL = unlimited
  view_count        INT NOT NULL DEFAULT 0,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoke_reason     TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_share_link_deck ON share_link(deck_id);
CREATE INDEX ix_share_link_workspace ON share_link(workspace_id);
CREATE INDEX ix_share_link_status_expires ON share_link(status, expires_at);
```

### `link_policy`

```sql
CREATE TABLE link_policy (
  id                  UUID PRIMARY KEY,
  link_id             UUID NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  level               TEXT NOT NULL,   -- public|password|domain_restricted|sso|request_access
  password_hash       TEXT,            -- bcrypt; only for password level
  allowed_email_domains TEXT[],        -- for domain_restricted
  sso_idp_id          UUID,            -- FK to idp_config; for sso
  allowed_parents     TEXT[],          -- for embed; e.g. notion.com, yoursite.com
  allow_external_links BOOLEAN NOT NULL DEFAULT FALSE,
  watermark_profile_id UUID REFERENCES watermark_profile(id),
  require_reauth_minutes INT,
  geo_allowlist       TEXT[],          -- ISO country codes; empty = all
  rate_limit_per_ip   INT,             -- per-IP requests/min cap
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `link_visibility_rule`

```sql
CREATE TABLE link_visibility_rule (
  id          UUID PRIMARY KEY,
  link_id     UUID NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  slide_id    UUID NOT NULL,
  visibility  TEXT NOT NULL,    -- visible|hidden|watermarked_only
  reason      TEXT,             -- author note (e.g., "internal financials")
  UNIQUE (link_id, slide_id)
);

CREATE INDEX ix_lvr_link ON link_visibility_rule(link_id);
```

### `watermark_profile`

```sql
CREATE TABLE watermark_profile (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  name          TEXT NOT NULL,
  visible       BOOLEAN NOT NULL DEFAULT FALSE,
  forensic      BOOLEAN NOT NULL DEFAULT FALSE,
  text_template TEXT NOT NULL DEFAULT '{email} • {ip_short} • {ts}',
  opacity       NUMERIC(4,3) NOT NULL DEFAULT 0.08,
  rotation_deg  NUMERIC(5,2) NOT NULL DEFAULT 15.0,
  tile_density  INT NOT NULL DEFAULT 6,
  font_family   TEXT NOT NULL DEFAULT 'Inter',
  color         TEXT NOT NULL DEFAULT '#000000',
  steg_channel  TEXT NOT NULL DEFAULT 'lsb',  -- lsb|dct|both
  dct_strength  NUMERIC(4,3) NOT NULL DEFAULT 0.02,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `custom_domain`

```sql
CREATE TABLE custom_domain (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL,
  domain          TEXT UNIQUE NOT NULL,
  verification_token TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending|verified|failed
  acme_account_id UUID,
  cert_pem        TEXT,
  cert_expiry     TIMESTAMPTZ,
  cert_status     TEXT NOT NULL DEFAULT 'pending',
  last_renewal_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at     TIMESTAMPTZ,
  white_label_theme_id UUID REFERENCES white_label_theme(id)
);
```

### `white_label_theme`

```sql
CREATE TABLE white_label_theme (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  name          TEXT NOT NULL,
  tokens        JSONB NOT NULL,    -- validated against allowlist schema
  logo_url      TEXT,
  favicon_url   TEXT,
  loading_copy  TEXT,
  footer_text   TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- tokens schema (validated):
-- {
--   "color": {"primary": "#...", "on-primary": "#...", "accent": "#..."},
--   "font":  {"display": "...", "body": "..."},
--   "radius": {"sm": "4px", "md": "8px"},
--   "spacing": {...}
-- }
```

### `embed_config`

```sql
CREATE TABLE embed_config (
  id              UUID PRIMARY KEY,
  link_id         UUID NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  allowed_parents TEXT[] NOT NULL DEFAULT '{}',
  show_chrome     BOOLEAN NOT NULL DEFAULT FALSE,
  show_export     BOOLEAN NOT NULL DEFAULT FALSE,
  show_watermark  BOOLEAN NOT NULL DEFAULT TRUE,
  post_message_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  custom_size_default JSONB,         -- {width, height}
  UNIQUE (link_id)
);
```

### `narration_track`

```sql
CREATE TABLE narration_track (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  deck_id       UUID NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en',
  source        TEXT NOT NULL,        -- recorded|uploaded|ai_generated
  total_duration_ms INT,
  cues          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- cues schema:
  -- [{"slide_id": "...", "start_ms": 0, "end_ms": 12000, "label": "intro"}, ...]
  hls_url       TEXT,
  captions_vtt_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, language)
);
```

### `export_job`

```sql
CREATE TABLE export_job (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  deck_id       UUID NOT NULL,
  link_id       UUID REFERENCES share_link(id),  -- for per-link scope
  format        TEXT NOT NULL,    -- mp4|pdf|pptx
  options       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued', -- queued|rendering|encoding|done|failed|canceled
  priority      TEXT NOT NULL DEFAULT 'standard',
  progress_pct  INT NOT NULL DEFAULT 0,
  artifact_url  TEXT,
  artifact_size_bytes BIGINT,
  degraded_slides JSONB NOT NULL DEFAULT '[]'::jsonb, -- list of {slide_id, reason}
  error_code    TEXT,
  error_message TEXT,
  submitted_by  UUID NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  version_id    UUID NOT NULL          -- pinned to this version
);

CREATE INDEX ix_export_job_status ON export_job(status);
CREATE INDEX ix_export_job_workspace ON export_job(workspace_id);
```

### `seo_metadata`

```sql
CREATE TABLE seo_metadata (
  id              UUID PRIMARY KEY,
  link_id         UUID NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  canonical_url   TEXT NOT NULL,
  og_image_url    TEXT,
  twitter_card    TEXT NOT NULL DEFAULT 'summary_large_image',
  robots          TEXT NOT NULL DEFAULT 'index,follow',
  json_ld         JSONB NOT NULL,
  last_snapshot_at TIMESTAMPTZ,
  last_snapshot_version_id UUID,
  UNIQUE (link_id)
);
```

### `social_card`

```sql
CREATE TABLE social_card (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL,
  deck_id       UUID NOT NULL,
  scope         TEXT NOT NULL,    -- deck|slide
  slide_id      UUID,             -- NULL for deck scope
  version_id    UUID NOT NULL,    -- regenerate on bump
  theme_id      UUID REFERENCES white_label_theme(id),
  composition   TEXT NOT NULL,    -- auto|title_hero|chart_hero|quote_hero
  image_url     TEXT NOT NULL,
  width         INT NOT NULL DEFAULT 1200,
  height        INT NOT NULL DEFAULT 630,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, scope, slide_id, version_id, theme_id)
);
```

### `handout_template`

```sql
CREATE TABLE handout_template (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL,
  name            TEXT NOT NULL,
  layout          TEXT NOT NULL,  -- 1up|2up|4up|6up|9up
  notes_position  TEXT,           -- right|below|none
  include_lines   BOOLEAN NOT NULL DEFAULT FALSE,
  qr_code         BOOLEAN NOT NULL DEFAULT TRUE,
  qr_target       TEXT NOT NULL DEFAULT 'live',  -- live|export
  page_size       TEXT NOT NULL DEFAULT 'A4',    -- A4|Letter|Custom
  color_profile   TEXT NOT NULL DEFAULT 'RGB',   -- RGB|CMYK
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. APIs and Contracts

> Style: REST + JSON over HTTPS. Auth: workspace session cookie for editor-side calls; signed token for share-side calls. Public APIs (#200) reuse the same contracts.

### 6.1 Link create/update

```http
POST   /v1/shares
  body: {
    deck_id: UUID,
    policy: {
      level: "public|password|domain_restricted|sso|request_access",
      password?: string,
      allowed_email_domains?: string[],
      sso_idp_id?: UUID,
      watermark_profile_id?: UUID,
      expires_at?: ISO8601,
      max_views?: int,
      geo_allowlist?: string[]
    },
    visibility_rules?: [
      {slide_id: UUID, visibility: "visible|hidden|watermarked_only"}
    ],
    embed_config?: {
      allowed_parents?: string[],
      show_chrome?: boolean,
      ...
    },
    custom_domain_id?: UUID,
    white_label_theme_id?: UUID,
    pinned_version_id?: UUID
  }
  → 201 {link_id, short_id, url, embed_code, signed_token_ttl}
  → 4xx validation errors

PATCH  /v1/shares/{link_id}
  body: any subset of the above
  → 200 {link_id, ..., version_id: int}

GET    /v1/shares/{link_id}
DELETE /v1/shares/{link_id}    -- soft-revoke; sets status=revoked
POST   /v1/shares/{link_id}/rotate-token
POST   /v1/shares/{link_id}/extend-expiry   -- body: {expires_at}
```

### 6.2 Policy CRUD

```http
GET    /v1/shares/{link_id}/policy
PUT    /v1/shares/{link_id}/policy
  body: {level, ...}
  → 200 {policy, audit_id}
```

Policies are versioned; every PUT emits an audit log entry and bumps the link's effective version.

### 6.3 Watermark generate

```http
POST   /v1/watermarks/apply
  body: {link_id, viewer_claims: {email, ip_short, ts}, asset_refs: [...]}
  → 202 {job_id}

GET    /v1/watermarks/jobs/{job_id}
  → 200 {status, outputs: [{asset_ref, viewer_variant_url}]}

-- Profile CRUD
POST   /v1/watermark-profiles
GET    /v1/watermark-profiles/{id}
PATCH  /v1/watermark-profiles/{id}
DELETE /v1/watermark-profiles/{id}
```

### 6.4 Export job submission

```http
POST   /v1/exports
  body: {
    deck_id: UUID,
    link_id?: UUID,             -- for per-link scope
    format: "mp4|pdf|pptx",
    options: {
      resolution?: "720p|1080p|4k",
      fps?: 24|30|60,
      narration_track_id?: UUID,
      include_burned_captions?: boolean,
      pdf_layout?: "1up|2up|4up|6up|9up",
      page_size?: "A4|Letter|Custom",
      pptx_compat?: "2019|2021|365",
      include_qr?: boolean,
      handout_template_id?: UUID
    },
    priority?: "fast|standard|bulk"
  }
  → 202 {job_id, eta_seconds, queue_position}

GET    /v1/exports/{job_id}
  → 200 {status, progress_pct, artifact_url?, degraded_slides?, error?}

POST   /v1/exports/{job_id}/cancel
```

### 6.5 Embed code

```http
GET    /v1/shares/{link_id}/embed-code
  → 200 {
    iframe_src: "https://cdn.domio.io/d/{short_id}?embed=1",
    recommended_size: {width: 960, height: 540},
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    allowed_parents_check: {domain: boolean, ...},
    post_message_protocol_version: "1.0"
  }
```

The embed code is rendered as a copyable `<iframe>` snippet:

```html
<iframe
  src="https://cdn.domio.io/d/abc12345?embed=1"
  width="960" height="540"
  allow="fullscreen; clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
  style="border:0"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

### 6.6 Public MCP-exposed surface (alignment with §16)

For agent-driven workflows (#221–#236):

```
mcp.tool.create_share_link(deck_id, policy, visibility_rules?, embed_config?) → link
mcp.tool.update_share_link(link_id, patch) → link
mcp.tool.revoke_share_link(link_id, reason?) → ack
mcp.tool.create_watermark_profile(spec) → profile
mcp.tool.apply_watermark(link_id, viewer_claims) → job_id
mcp.tool.queue_export(deck_id, format, options) → job_id
mcp.tool.get_export_status(job_id) → status
mcp.tool.attach_custom_domain(domain, theme_id?) → {verification_token, instructions}
mcp.tool.verify_custom_domain(domain_id) → {status}
mcp.tool.generate_social_card(deck_id, slide_id?, composition?) → url
mcp.tool.list_share_links(deck_id) → [link]
```

---

## 7. Security

### 7.1 Signed tokens for share links

- Tokens are **HMAC-SHA256** over `{short_id, expires_at, viewer_claims, nonce}` keyed by a per-workspace secret (rotated quarterly).
- The signed token lives in a **HttpOnly, Secure, SameSite=Lax** cookie after the first authenticated request; the URL itself only carries the `short_id`.
- Constant-time comparison server-side; replay protection via nonce in Redis (TTL = token TTL).
- For embed contexts, a separate embed-token scope with tighter claim set (no email, only `link_id`).

### 7.2 Watermark forensics

- The forensic watermark is **not a secret** in the cryptographic sense — it's a forensic channel: anyone can theoretically remove a single-channel steg signal, but the per-viewer asset variant + DCT-mod pattern combination makes it operationally expensive to strip.
- The per-viewer variant is generated lazily and cached; an attacker who defeats one variant must defeat all of them across the deck.
- For 4K video exports, the DCT-mod is applied across the entire video (every frame), not just the I-frames — survives transcoding to a degree that depends on codec.
- **Removal is impossible by design**; we frame the product as "the leak will be traced, not prevented." Documented in the link owner's privacy policy.

### 7.3 Custom domain validation

- DNS verification token is a 32-byte random value, single-use, expires in 7 days.
- ACME DNS-01 challenge uses a per-domain `_acme-challenge` TXT record; private key never leaves the secret store.
- Domain ownership is re-verified at renewal time (DNS lookups are cheap and provide ongoing evidence of control).
- Domains are bound to a single workspace; cross-workspace transfer requires explicit re-verification.

### 7.4 White-label isolation

- White-label tokens are sanitized server-side against a strict allowlist schema (no `url()`, no `@import`, no `behavior:`, no `expression(...)`).
- Tokens cannot reach into other workspaces' resources — the white-label renderer loads only its own workspace's assets and the link's deck.
- A white-label viewer cannot host another tenant's content: per-workspace subdomains enforced at the CDN edge.
- Custom-domain DNS rebinding attempts (e.g., a domain pointing to multiple workspaces) are detected at verification and rejected.

### 7.5 Embed CSP

- `frame-ancestors` restricted to the link's `allowed_parents` list (default empty → only the workspace's own domains).
- `default-src 'self' cdn.domio.io; script-src 'self' 'sha256-...' 'nonce-...'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' api.domio.io;`
- No eval, no inline scripts without nonce, no remote scripts.
- `Permissions-Policy` opts in features explicitly (camera, microphone, clipboard, fullscreen).
- `Referrer-Policy: strict-origin-when-cross-origin` to limit leak.

### 7.6 Export DRM (where applicable)

- **PDF**: optional owner-password + 256-bit AES encryption; permissions flags restrict printing/editing.
- **PPTX**: standard OOXML read-only enforcement flag; full DRM requires Microsoft IRM, not built in v1.
- **MP4**: optional widevine-style DRM is **not** in v1; forensic watermark serves as the deterrent. Documented in the export dialog.
- All export artifacts are signed URLs (short-lived) for download.

### 7.7 Update propagation atomicity

- `deck.updated` events are published **after** the new `version_id` is durable in the primary store (Postgres), but **before** the CDN invalidation.
- In the unlikely window between event publish and CDN invalidation, the renderer may serve a stale snapshot for ≤5s.
- The export service is the exception: it always pins to the version it was triggered against (#168), so export atomicity is guaranteed by the version_id at job creation.
- For SEO snapshots (#165), invalidation is idempotent — replaying `deck.updated` N times has the same effect as once.

### 7.8 Threat-model crosswalk (OWASP Top 10 highlights)

| Risk | Mitigation |
|---|---|
| Broken Access Control | Access policy engine is the single decision point; verified per request |
| Cryptographic Failures | TLS everywhere; signed tokens; AES-at-rest for certs and forensic assets |
| Injection | CSP on embeds; sanitized white-label tokens; parameterized SQL via ORM |
| Insecure Design | Threat-model per service; pen-test before GA; red team annually |
| Security Misconfiguration | IaC-managed config; drift detection; secrets in vault, never env-vars in prod |
| Vulnerable Components | Dependabot + SBOM; quarterly SCA; AGPL avoidance per pre-dev §11.7 |
| Auth Failures | MFA on workspace admin; SSO optional; rate-limited login; session rotation |
| Software/Data Integrity | Signed URLs for assets; versioned schema migrations; immutable audit log |
| Logging/Monitoring Failures | Structured logs; per-service dashboards; alert thresholds |
| SSRF | Embed proxy blocks internal IP ranges; ACME has dedicated egress |

---

## 8. Performance

### 8.1 Renderer time-to-first-byte (TTFB)

- Edge cache: `/d/{short_id}` HTML response cached at the CDN, keyed by `{short_id, viewer_token_class, version_id}`. Cache hit TTFB ≤ 50ms (p95).
- Origin TTFB: ≤ 200ms (p95) — policy engine lookup is the hot path (Redis-backed).
- Cold-start (new short_id, no cache): ≤ 600ms (p95).

### 8.2 Scroll-mode FPS

- Active slide only mounted; neighbors mounted as serialized state (no DOM).
- `IntersectionObserver` + `requestAnimationFrame` coalescing — animation frames scheduled at most once per frame even with multiple triggers.
- 3D and heavy Lottie animations opt into "viewport-only" execution; when out of view, paused.
- Reduced-motion mode drops to ~30fps minimum frame budget, freeing CPU.

### 8.3 Export queue scaling

- Three priority lanes (`fast`, `standard`, `bulk`) with weighted fair scheduling.
- Worker pool sized per cluster; auto-scales on queue depth (target: drain queue in <2× average job time).
- Long jobs (>10 min video at 4K) are routed to dedicated high-memory workers.
- Per-workspace quota (jobs/day, minutes/day) enforced at submission; soft limit returns 429 with `Retry-After`.

### 8.4 CDN cache invalidation strategy

- Two-tier: CDN edge + origin Redis.
- Invalidation on `deck.updated`: **purge-by-tag** (`deck:{id}:v{version}`) for SEO snapshots and social cards; **soft-expire** for the renderer HTML (serve stale while revalidate).
- The renderer uses **stale-while-revalidate** to mask the 5s invalidation window.
- Origin cache (Redis) TTL = 5 min for renderer HTML; CDN TTL = 1 hour but invalidated on `deck.updated`.
- Video exports are **never** invalidated — version-pinned by design.

### 8.5 Per-region / global performance budget

- Renderer JS bundle: ≤ 90 KB gzipped first paint.
- Per-slide bundle: ≤ 25 KB gzipped average.
- CSS: ≤ 12 KB gzipped.
- Webfonts: ≤ 2 webfonts, ≤ 80 KB total, with `font-display: swap`.
- Image variants: AVIF + WebP + JPEG fallback; sizes attribute for responsive srcset.

---

## 9. Observability and Testing

### 9.1 Observability

| Signal | What we capture |
|---|---|
| **Logs** | Structured JSON per service; correlation id flows from editor → share service → renderer; per-request access-policy decision logged |
| **Metrics** | Renderer p50/p95/p99 TTFB, scroll FPS (sampled), export queue depth, watermark generation throughput, ACME renewal success rate, custom-domain DNS verification latency, embed CSP violation count, forensic watermark cache hit rate |
| **Traces** | OpenTelemetry across all services; trace_id flows from editor session → renderer session → analytics event |
| **Audit log** | Every share-link create/update/delete, every policy change, every watermark generation, every domain add/verify/renew, every export job submit/complete, every embed render — immutable, queryable by workspace admin |
| **Alerting** | Pager: TTFB p95 > 500ms for 5 min, queue depth > 1000, cert renewal failure, ACME rate-limit warnings, security events (CSRF, brute-force), CDN error rate spike |

### 9.2 Testing strategy (test pyramid)

- **Unit (70%):** policy engine evaluation, watermark sanitization, token signing, layout service composition, embed CSP synthesis.
- **Integration (20%):** service-to-service contracts (Postman/Newman + Pact); event-bus subscribers; export pipeline up to headless render.
- **E2E (10%):** Cypress/Playwright for editor → share → renderer; full export round-trip; embed in Notion via test fixtures.
- **Performance:** Lighthouse CI on the renderer (mobile + desktop profiles); synthetic scroll FPS at 60fps target.
- **Security:** Pen-test pre-GA; quarterly red team; fuzz the policy engine; CSP evaluator unit tests.
- **Visual regression:** Percy/Chromatic on the renderer for each white-label theme × scroll/standard mode.
- **Compliance:** WCAG AA automated + manual screen-reader pass; data residency test for restricted-tier data.

### 9.3 Definition of done (DoD) for sharing/publishing features

- [ ] API contract added to OpenAPI; published on docs site
- [ ] Feature behind a flag (per §4.9 of pre-dev guide) until GA criteria met
- [ ] Audit log entry created for every privileged action
- [ ] Watermark forensic verification: a known-good test deck, render to viewer-A and viewer-B, decode both forensic signals → distinct claims recovered
- [ ] Security review by at least one team member not on the feature
- [ ] Load test on the policy engine at 10× expected RPS
- [ ] CDN cache invalidation test: edit a deck, observe ≤5s propagation
- [ ] Embed sandbox test: try to embed on a denied parent → 403 received, no leak
- [ ] Custom domain end-to-end: add → verify → cert issued → TLS handshake → renderer loads under new domain
- [ ] Export round-trip: 50-slide deck with all interactive elements → MP4 + PDF + PPTX, with correct `degraded_slides` and `snapshot timestamp`

---

## 10. Cross-Section Ties

| Section 11 feature | Tied to | What's reused / shared |
|---|---|---|
| **#155 Deck-as-website** | §1 editor (#22 autosave, #21 CRDT sync) | The renderer's source of truth is the deck state from §1; viewer subscribes via the same `deck.updated` event bus |
| **#156 Scroll mode** | §6 animations (#90 scroll-linked, #93 reduced-motion, #95 GIF export) | Scroll choreography authored in the timeline editor (§6) drives the scroll-mode renderer; reduced-motion preference is read from the OS via the same media-query system |
| **#157–#158 Access + expiry + watermark** | §4 live data (#64 data source access control) | Viewers never see raw credentials; the same proxy pattern applies to data sources accessed from inside the renderer |
| **#159 Per-link visibility** | §4 live data (#51 data refresh on stage, #57 scenario switcher, #63 stale-data indicator) | A viewer's scenario state is part of the link's session; per-link visibility can scope scenarios too |
| **#160 Custom domains + white-label** | §3 theming (#37 design tokens, #40 brand extraction, #44 accessibility theming) | White-label tokens reuse the §3 design-token schema; brand-extracted tokens can pre-fill a white-label theme |
| **#161 Embeds** | §10 audience participation (#142 audience QR, #143 polls, #153 captions) | Embed retains audience features inside a parent page; the embed proxy whitelists the §10 participation feature flags per-link |
| **#162 Narrated autoplay** | §8 AI (#113 translation, #116 AI notes, #153 live captions) | Narration tracks are auto-generated from notes (#116) and translated (#113); caption sidecar reuses §10 caption infrastructure |
| **#163 Video export** | §6 animation (#95 GIF/video export of any animated slide), §8 AI (#116 notes → narration) | The headless renderer used by export is the same one used by §6 GIF export; narration from #162 flows into #163 |
| **#164 PDF/PPTX export** | §4 live data (#63 stale-data), §13 collaboration (#180 approval before share) | Export snapshots the live-data state and timestamps it; pre-share approval workflow can gate export of high-stakes decks |
| **#165 SEO** | §12 analytics (#169 per-viewer, #171 attention heatmaps) | SEO traffic is the top-of-funnel signal for §12; the SEO service emits `deck.viewed` events the analytics plane ingests |
| **#166 Social cards** | §13 (#187 content expiry policies) | A social card captures the deck's state at a moment in time; expiry policy can regenerate cards on a schedule |
| **#167 Print handout** | §9 presenter (#141 post-presentation recap) | Handout is the natural "takeaway" complement to the recap; both are export-style artifacts in the post-meeting flow |
| **#168 Update propagation** | §4 (#51 data refresh), §12 (#172 sales-mode notifications), §13 (#186 auto-updating shared slides) | Update propagation is the unifying event: data refresh (§4), notification (§12), and shared-slide updates (§13) all flow through the same `deck.updated` bus |
| **Custom domains (§14 #193)** | §14 enterprise (#193 SSO, #194 brand governance, #196 audit logs, #197 residency) | Custom-domain provisioning is gated by enterprise SSO; per-region residency constraints affect where TLS certs/ACME accounts live |

---

## 11. Out-of-Scope / Non-Goals (for this section's MVP)

- **Widevine/PlayReady DRM on video exports** — forensic watermark is v1's deterrent; proper DRM is a v2 feature.
- **Native PowerPoint plug-in for one-way sync into existing enterprise PPTX workflows** — out; export covers the round-trip.
- **Built-in Notion app** — v1 ships the embed snippet + bookmarklet; OAuth Notion app is a v2 convenience.
- **Voice cloning for AI narration** — narration v1 uses the author's recorded voice or a stock TTS voice; cloning requires explicit consent flow (v2).
- **Self-served ACME for on-prem** — out for v1; managed by Domio. On-prem ACME is part of the local-first SDK mentioned in §16 (#232).

---

## 12. Open Questions

1. **Per-viewer asset variant caching cost** — at 1M viewers × 50 slides, variant cache is large. Need a retention policy (LRU 30d? LRU on first-non-view?). To resolve with storage team.
2. **Forensic watermark claims leakage** — if a viewer screenshots and posts publicly, the claim is recoverable, but the *legal* chain of custody needs legal counsel review (per pre-dev §11.6).
3. **Custom-domain rate limits** — LE has a 50 cert/week per-domain cap; bulk enterprise onboardings need a multi-CAA strategy or LE account pooling.
4. **PDF/UA full compliance** — PDF/UA is a deep spec; v1 targets structural conformance with manual remediation for edge cases.

---

## 13. Summary

Section 11 elevates a deck from a file to a **versioned, addressable, governed surface** with five mutually consistent layers: rendering (155, 156, 162), access (157, 158, 159), branding & reach (160, 161), exports (163, 164, 167), and SEO/discovery (165, 166, 168). The architecture is modular-monolith-friendly with clean event-driven seams (`deck.updated` bus), so it can be split into independent services if scale demands. Security is layered (signed tokens, forensic watermarks, CSP, ACME-issued TLS); performance budgets are tight (TTFB p95 ≤ 200ms origin, scroll FPS 60 desktop / 30 mobile); and every feature ties back to a section in the feature list and the pre-development planning guide.

**File path:** `/home/daiyaan2002/Desktop/Projects/domio/docs/sharing-publishing.md`

**Coverage:**
- Features 155–168: all 14 features covered with acceptance criteria, behavior, and edge cases.
- UX flows: link generation, access-level config, per-slide visibility, scroll preview, Notion embed, narrated autoplay, video/PDF/PPTX export — all 7 flows covered.
- Functional + non-functional: all 15 sub-areas (renderer, scroll perf, access control, expiring links, watermarking, custom domain + TLS, white-label, embed sandboxing, narrated autoplay, video export, PDF/PPTX, SEO, social cards, handouts, update propagation).
- Architecture: 12 services + event bus, with boundaries and storage choice.
- Data model: 11 tables with full SQL DDL.
- APIs: link create/update, policy CRUD, watermark generate, export submit, embed code + MCP surface.
- Security: signed tokens, forensic watermarks, domain validation, white-label isolation, CSP, export DRM posture, propagation atomicity, OWASP crosswalk.
- Performance: TTFB, scroll FPS, queue scaling, CDN invalidation, bundle budget.
- Observability + testing: signals captured, test pyramid, DoD checklist.
- Cross-section ties: 14 explicit ties to other sections.