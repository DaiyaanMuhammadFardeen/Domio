# Wave 3 — Viewer & Publishing

**Intent.** Replace the `apps/viewer/src/app/page.tsx` "Coming soon" stub with a production viewer app. Build the entire publish / share / embed / deck-as-website user surface so that every §11 (Sharing, Publishing & Deck-as-a-Website) feature is reachable from a clean, branded UI.

**Why it matters.** The viewer is the public face of every deck. A board member, an investor, a prospect opens a `deck.domio.app` link and forms their first impression of the product here. A stubbed viewer is a credibility-zero experience.

---

## 1. Scope

- **§11 Sharing, Publishing & Deck-as-a-Website:** #155–168.
- **§5 3D / motion / media:** audience-side rendering for #65–84.
- **§6 Animation:** scroll-linked + reduced-motion for #90, #93.
- **§7 Prototyping:** device-frame + branching navigation for #97, #103, #107.

---

## 2. Sub-phase map

### S3.1 — Production viewer app

**Features:** #155, #165, #166.

**Files to create/modify:**
- `apps/viewer/src/app/[deckId]/page.tsx` — replaces stub.
- `apps/viewer/src/app/[deckId]/[slideIdx]/page.tsx` — slide-specific route.
- `apps/viewer/src/components/ViewerShell.tsx`
- `apps/viewer/src/components/ViewerNav.tsx`
- `apps/viewer/src/components/ViewerProgress.tsx`
- `apps/viewer/src/lib/{deck,publish,embed,seo}-service.ts`

**Build instructions:**
1. `/[deckId]` resolves to the deck's first slide (or a server-rendered cover page if a cover is configured).
2. `/[deckId]/[slideIdx]` deep-links any slide.
3. SEO meta + Open Graph tags come from `services/publish` (`/v1/publish/[deckId]/seo`).
4. Viewer renders on a 16:9 stage with letterboxing; fullscreen-toggle button.
5. Keyboard nav: `←/→` advance, `f` fullscreen, `o` overview grid, `?` help.
6. Touch: swipe to advance, pinch to overview.
7. Watermark (if share policy includes one) renders per-viewer.
8. Reduced-motion: animations on slides become 200 ms fades when `prefers-reduced-motion: reduce`.

**SOLID notes:**
- **S:** `ViewerShell` is layout; `ViewerNav` is chrome; slide rendering is a separate component receiving the slide data.
- **O:** a new renderer (e.g. for a new element type) registers via the scene-graph registry; the viewer iterates the registry.

**Acceptance:**
- Viewer renders any deck from the registry; no special-case code for "demo" decks.
- Lighthouse SEO ≥ 100 on a published deck.

---

### S3.2 — Scroll mode

**Features:** #156.

**Files to create:**
- `apps/viewer/src/app/[deckId]/scroll/page.tsx`
- `apps/viewer/src/components/ScrollMode.tsx`
- `apps/viewer/src/components/ScrollSlide.tsx`

**Build instructions:**
1. Same deck renders as a vertical scrollytelling page.
2. Each slide sticks to the viewport top for one viewport-height.
3. In-slide animations replay as the slide enters the viewport (IntersectionObserver).
4. Toggle button in viewer nav switches between stage mode and scroll mode.
5. URL updates (`?mode=scroll`) so the choice is shareable.

---

### S3.3 — Visibility / domain / SSO sharing controls (in editor share dialog)

**Features:** #157, #158.

**Files to create:**
- `apps/editor/src/components/share/ShareDialog.tsx` (replaces the existing share-button placement)
- `apps/editor/src/components/share/VisibilityPicker.tsx`
- `apps/editor/src/components/share/DomainAllowlist.tsx`
- `apps/editor/src/components/share/SSOConfig.tsx`

**Build instructions:**
1. Share dialog opens from the editor top bar; tabs: **Link**, **Embed**, **Visibility**, **Audience**, **Versions**.
2. Visibility picker: Public, Password, Domain-restricted, SSO-gated, Email-gated.
3. Password field writes to `POST /v1/shares/{id}/policy` with `{ kind: "password", value }`.
4. Domain allowlist: paste domains, one per line; saved as a list policy.
5. SSO-gated: select tenant + role; redirect URL emitted.
6. Expiring link: date picker + duration; calls `POST /v1/shares/{id}/expiry`.
7. Per-viewer watermarking: toggle; viewer email/id overlays bottom-right at 8% opacity.

---

### S3.4 — Per-link content control

**Features:** #159.

**Files to create:**
- `apps/editor/src/components/share/ContentControlTab.tsx`

**Build instructions:**
1. Editor shows a tree of slides with checkboxes. Each share link has its own checked set.
2. "Investor view" link excludes the appendix; "Internal view" includes everything.
3. Saved as `POST /v1/shares/{id}/slides` with `{ visible: [slideIds] }`.

---

### S3.5 — Custom domains + white-label

**Features:** #160.

**Files to create:**
- `apps/admin-console/src/app/custom-domains/page.tsx` (admin)
- `apps/editor/src/components/share/CustomDomainPicker.tsx`

**Build instructions:**
1. Admin page lists custom domains per tenant; shows verification status (CNAME).
2. Editor share dialog exposes a "Custom domain" picker; selecting one rewrites the share URL.
3. White-label settings: logo + brand color override on the viewer chrome; tenant-scoped.

---

### S3.6 — Embed playground

**Features:** #161.

**Files to create:**
- `apps/editor/src/components/share/EmbedPlayground.tsx`

**Build instructions:**
1. Embed playground: pick a deck + starting slide + size; live preview iframe; copy HTML snippet.
2. iframe uses `services/embed-proxy` to issue a JWT; snippet embeds `<iframe src="https://embed.domio.app/.../..." allow="..." sandbox="..."></iframe>`.
3. Configurable: allow-interactivity, allow-fullscreen, lazy-load, theme sync.

---

### S3.7 — Narrated auto-play

**Features:** #162.

**Files to create:**
- `apps/viewer/src/components/AutoPlayMode.tsx`

**Build instructions:**
1. AutoPlay mode reads a recorded voiceover (`services/recording-orchestrator` produces it) and advances slides synced to audio.
2. Interactive elements remain interactive; clicking pauses auto-advance.
3. Toggle from viewer nav.

---

### S3.8 — Video / PDF / PPTX export UI

**Features:** #163, #164.

**Files to create:**
- `apps/editor/src/components/share/ExportDialog.tsx`
- `apps/editor/src/components/share/ExportProgressTracker.tsx`

**Build instructions:**
1. Export dialog: format picker (MP4, PDF, PPTX), quality, slide range.
2. Submit to `POST /v1/export`; poll or subscribe to job status.
3. Progress tracker shows percent + remaining slides.
4. Download link activates on completion.

---

### S3.9 — SEO + social preview

**Features:** #165, #166.

**Files to create:**
- `apps/editor/src/components/share/SEOTab.tsx`
- `apps/editor/src/components/share/SocialPreviewCard.tsx`

**Build instructions:**
1. SEO tab: title, description, canonical URL, robots directives; calls `POST /v1/publish/[deckId]/seo`.
2. Social preview card: per-platform preview (Twitter, LinkedIn, Slack); auto-generated image from the deck's first slide; manual override.

---

### S3.10 — Print-optimized handouts

**Features:** #167.

**Files to create:**
- `apps/editor/src/components/share/HandoutLayoutPicker.tsx`

**Build instructions:**
1. Layouts: notes pages (one slide + notes per page), 4-up grid, 6-up grid, 9-up grid.
2. Calls `POST /v1/export` with `format: pdf, layout: handout-{kind}`.

---

### S3.11 — Deck update propagation

**Features:** #168.

**Files to create:**
- `apps/editor/src/components/share/VersionPinSelector.tsx`

**Build instructions:**
1. Each share link pins to a deck version; "always latest" toggle.
2. Selecting a version calls `PATCH /v1/shares/{id}` with `{ pinVersion: 'v' | 'latest' }`.
3. Admin sees a propagation audit log per workspace.

---

### S3.12 — 3D / AR / video / embed renderers in viewer

**Features:** #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78, #79, #80, #81, #82, #83, #84 (audience-side).

**Files to create/modify:**
- `apps/viewer/src/three/{Model3DViewer,CadImportedModel,KeyframePath}.tsx`
- `apps/viewer/src/ar/ARHandoff.tsx`
- `apps/viewer/src/video/{VideoPlayer,SegmentedVideoPlayer}.tsx`
- `apps/viewer/src/audio/{AudioTrack,Voiceover}.tsx`
- `apps/viewer/src/animation/{LottiePlayer,RivePlayer}.tsx`
- `apps/viewer/src/embeds/{LiveAppEmbed,CodeBlock,LatexBlock,Map}.tsx`

**Build instructions:**
1. Each element type is a separate React component reading its scene-graph descriptor.
2. `Model3DViewer` uses `apps/viewer/src/three/` and is shared with the editor's preview (S2.10).
3. AR handoff generates a QR linking to the AR viewer (`apps/viewer/src/app/ar/[token]/page.tsx`).
4. Video player supports segment-by-click via time markers stored in the element descriptor.
5. Code block sandbox runs through `services/code-sandbox`; output renders below.
6. LaTeX renders to SVG via `services/latex-render`.

**SOLID notes:**
- **S:** each renderer is one file; viewer code never special-cases element kinds.
- **O:** adding a new element type requires one new renderer file + one entry in `scene-graph` registry.

**Acceptance:**
- A deck with one of every element type renders correctly in the viewer.

---

### S3.13 — Device frames + branching navigation in viewer

**Features:** #97, #103, #107.

**Files to create:**
- `apps/viewer/src/components/DeviceFrame.tsx`
- `apps/viewer/src/components/BranchingNavigator.tsx`

**Build instructions:**
1. Device frames (iPhone/iPad/Mac) wrap a slide; the wrapped slide is interactive within the frame.
2. Branching navigator: a non-linear deck surfaces a "What next?" choice on slides that branch.
3. Deep-link state restoration: opening a URL with `?state=...` sets variables, scenarios, and slide index.

---

## 3. SOLID injection

### Viewer module map
```
apps/viewer/src/
├── app/
│   ├── [deckId]/page.tsx
│   ├── [deckId]/[slideIdx]/page.tsx
│   ├── [deckId]/scroll/page.tsx
│   └── ar/[token]/page.tsx
├── components/
│   ├── ViewerShell.tsx
│   ├── ViewerNav.tsx
│   ├── ScrollMode.tsx
│   ├── DeviceFrame.tsx
│   ├── BranchingNavigator.tsx
│   ├── three/, ar/, video/, audio/, animation/, embeds/
├── lib/{deck,publish,embed,seo}-service.ts
└── store/
```

### Rule: viewer is renderer-only
The viewer never edits state; it only renders and emits telemetry. All editing authority is in the editor and presenter apps. This means viewer's store can be simpler than the editor's, and the viewer's bundle can be smaller.

---

## 4. Out of scope

- Live presenter overlays (Wave 4).
- Audience participation widgets (Wave 5).
- Analytics dashboards (Wave 7).

---

## 5. DoD checklist

- [ ] `apps/viewer/src/app/page.tsx` deleted; root redirects to `/[deckId]`.
- [ ] All §11 features reachable from share dialog or viewer.
- [ ] All §5 audience-side features render correctly.
- [ ] Lighthouse PWA ≥ 90, accessibility ≥ 95, SEO = 100 on a public deck.
- [ ] Reduced-motion mode respected.
- [ ] Per-platform social preview tested with Twitter Card Validator + LinkedIn Post Inspector.
- [ ] Watermark rendered per viewer identity.
- [ ] No dummy fallback when share metadata is missing — show an actionable empty state.
