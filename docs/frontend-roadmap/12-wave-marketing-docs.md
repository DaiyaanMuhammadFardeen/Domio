# Wave 12 — Marketing Landing & Docs

**Intent.** Replace the `apps/landing/src/app/page.tsx` "Coming soon" stub with a production marketing site. Build a docs site. Make every feature demoable on a 30-second loop. Drive adoption.

**Why it matters.** This is the wave that turns engineering output into signups. Without a polished landing, every prior wave's value is invisible.

---

## 1. Scope

- §15 / §16 features that need demo videos.
- §13 / §14 features that need admin / enterprise marketing.
- Marketing site, docs site, changelog, plugin SDK portal entry point.

---

## 2. Sub-phase map

### S12.1 — Production landing page

**Files to create:**
- `apps/landing/src/app/page.tsx` (replace stub)
- `apps/landing/src/app/(sections)/{hero,features,how-it-works,pricing,customers,faq,footer}.tsx`
- `apps/landing/src/components/{HeroAnimation,FeatureGrid,PricingTable,CustomerLogoStrip,FaqAccordion}.tsx`

**Build instructions:**
1. Hero with animated canvas showing real features (editor canvas rotating through slides).
2. Feature grid: 24 feature cards (one per major capability), each links to a deep-dive section.
3. "How it works" 3-step video.
4. Pricing table: 3 tiers (Free, Pro, Enterprise) with feature comparison.
5. Customer logo strip.
6. FAQ accordion with 20+ entries.
7. Footer with company links + legal.

**SOLID notes:**
- **S:** each section is a component; the page composes them.

**Acceptance:**
- Lighthouse ≥ 95 across all metrics.
- SSR + ISR for fast TTFB.

---

### S12.2 — Feature deep-dive pages

**Files to create:**
- `apps/landing/src/app/features/[slug]/page.tsx`
- `apps/landing/src/components/feature-page/{Hero,Screenshot,GifDemo,TutorialSteps,RelatedFeatures}.tsx`

**Build instructions:**
1. One page per major feature (24+).
2. Hero illustration + 30-second animated demo GIF.
3. Tutorial steps with screenshots.
4. "Try it now" CTA → `/signup?feature=<slug>`.

---

### S12.3 — Pricing + signup

**Files to create:**
- `apps/landing/src/app/pricing/page.tsx`
- `apps/landing/src/app/signup/page.tsx`
- `apps/landing/src/app/login/page.tsx`
- `apps/landing/src/app/forgot-password/page.tsx`

**Build instructions:**
1. Pricing tiers with annual/monthly toggle.
2. Signup form: email, password, SSO option, plan selection.
3. Login: email/password + SSO buttons.
4. Forgot password email flow.

---

### S12.4 — Docs site

**Files to create:**
- `apps/landing/src/app/docs/[[...slug]]/page.tsx`
- `apps/landing/src/components/docs/{Sidebar,PageHeader,CodeBlock,Callout,Tabs}.tsx`

**Build instructions:**
1. Sidebar nav: Getting Started, Editor, Viewer, Presenter, Audience, Sharing, AI, Analytics, Marketplace, Enterprise, Agentic, API Reference.
2. Each page: MDX content with embedded React demos.
3. Code blocks with copy button.
4. Search (Algolia or local index).

---

### S12.5 — Changelog

**Files to create:**
- `apps/landing/src/app/changelog/page.tsx`

**Build instructions:**
1. List releases newest-first.
2. Each entry: version, date, highlights, breaking changes, migration guide link.

---

### S12.6 — Demo gallery

**Files to create:**
- `apps/landing/src/app/demos/page.tsx`
- `apps/landing/src/components/demo/{DemoTile,DemoEmbed}.tsx`

**Build instructions:**
1. Tile per feature demo with embedded `viewer` link.
2. "Open in editor" CTA on each.

---

### S12.7 — Trust & security page

**Files to create:**
- `apps/landing/src/app/trust/page.tsx`

**Build instructions:**
1. SOC 2, GDPR, CCPA, PDPA badges.
2. Data residency map.
3. Security contact.

---

### S12.8 — Status page

**Files to create:**
- `apps/landing/src/app/status/page.tsx`

**Build instructions:**
1. Per-service status (online/degraded/outage).
2. 90-day uptime history.
3. Subscribe to updates.

---

### S12.9 — Help center + community

**Files to create:**
- `apps/landing/src/app/help/page.tsx`
- `apps/landing/src/app/community/page.tsx`

**Build instructions:**
1. Help center: searchable KB articles.
2. Community: Discord / forum link.

---

### S12.10 — Blog

**Files to create:**
- `apps/landing/src/app/blog/page.tsx`
- `apps/landing/src/app/blog/[slug]/page.tsx`

**Build instructions:**
1. MDX blog posts with categories.
2. RSS feed.

---

### S12.11 — Careers

**Files to create:**
- `apps/landing/src/app/careers/page.tsx`

**Build instructions:**
1. Open roles list.
2. Apply via Greenhouse / Lever.

---

## 3. SOLID injection

### Landing module map
```
apps/landing/src/
├── app/
│   ├── page.tsx
│   ├── (sections)/...
│   ├── features/[slug]/page.tsx
│   ├── pricing/page.tsx
│   ├── signup/page.tsx
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   ├── docs/[[...slug]]/page.tsx
│   ├── changelog/page.tsx
│   ├── demos/page.tsx
│   ├── trust/page.tsx
│   ├── status/page.tsx
│   ├── help/page.tsx
│   ├── community/page.tsx
│   ├── blog/page.tsx
│   ├── blog/[slug]/page.tsx
│   ├── careers/page.tsx
│   ├── cli/page.tsx            # from Wave 10
│   └── plugins-sdk/page.tsx    # from Wave 10
└── components/
```

### Rule: marketing content is data-driven
Pricing tiers, feature comparisons, customer logos, FAQ items, demo tiles — all read from JSON / MDX files. Marketing can change copy without engineering.

---

## 4. Out of scope

- CRM integration for sales (separate project).
- Customer support tool integration (Zendesk/Intercom via embed).

---

## 5. DoD checklist

- [ ] Landing page Lighthouse ≥ 95 across all metrics.
- [ ] All 24+ feature pages live.
- [ ] Docs site searchable and MDX-rendered.
- [ ] Demo gallery loads in <1 s.
- [ ] Signup flow completes end-to-end.
- [ ] Changelog auto-generated from git tags.
- [ ] Status page reads from health endpoints.
- [ ] All marketing pages i18n-aware.
