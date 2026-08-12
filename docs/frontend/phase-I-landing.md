# Phase I — Landing page (public marketing)

## Context

`apps/landing/src/app/page.tsx` is a 17-line "Coming soon" stub. Visitors
who hit `http://localhost:3003/` (or the prod domain) see nothing.

Marketing landing pages usually don't depend on internal services — they're
a static-ish showcase of the product. But they DO need to deep-link into
the editor, marketplace, viewer, and presenter apps.

## Routes to build

| Route       | Renders                                          |
| ----------- | ------------------------------------------------ |
| `/`         | Marketing home: hero + features + CTA            |
| `/features` | Detailed feature breakdown                       |
| `/pricing`  | Tier comparison (free / pro / enterprise)        |
| `/changelog`| Public changelog                                 |

## Files to change

### `apps/landing/src/app/page.tsx`

Replace the stub with a real marketing page. Sections:

1. Hero — "Domio · Where stories come alive" with a CTA into `/editor`.
2. Feature grid — one card per app:
   - **Editor** — link to `/editor` (the editor app, port 3100)
   - **Dashboard** — link to `/dashboard` (the dashboard app, port 3000)
   - **Viewer** — link to `/viewer` (the viewer app, port 3001)
   - **Presenter** — link to `/presenter` (port 3002)
   - **Marketplace** — link to `/marketplace` (port 3006)
   - **Audience** — link to `/join` (port 3003)
3. Use cases — solo creators, teams, live events.
4. Footer — links to docs, repo, status.

### `apps/landing/src/app/features/page.tsx` (new)

Static page. Reads `content/features.json` (new) and renders a long-form
breakdown.

### `apps/landing/src/app/pricing/page.tsx` (new)

Static page. Reads `content/pricing.json` (new) and renders three tier cards.

### `apps/landing/src/app/changelog/page.tsx` (new)

Reads `apps/landing/content/changelog.json` (or fetches from the
marketplace's public changelog API — pick whichever exists first).

## No service wiring required

Landing has no backend dependencies in this phase. Everything is static
content. CTAs deep-link into other apps.

## Verification

1. Open `http://localhost:3004/` (landing dev port, verify in
   `apps/landing/package.json`) — renders the marketing home.
2. Click "Editor" CTA → opens `/editor` (3100).
3. Click "Marketplace" → opens `/marketplace` (3006).
4. Open `/features`, `/pricing`, `/changelog` — each renders without errors.

## Risk / out of scope

- No CMS integration. Marketing copy is JSON in the repo.
- No i18n — copy is English-only in this phase. (Marketplace-web already
  has `@domio/i18n`; reuse it later if needed.)
- No SEO/sitemap/og:image yet — separate phase.