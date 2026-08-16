# Domio — Front-end apps

> **Source of truth:** `apps/` (11 entries). **Last regenerated:** 2026-08-16.

## 1. Shared stack

- **Next.js** 15.1.3 (App Router)
- **React** 19.0.0
- **TypeScript** 5.7.2
- **Tailwind CSS** 3.4 (`editor`, `dashboard`, `marketplace-web`,
  `creator-console`, `admin-console`)
- **Vite** + Vitest 2.1.8 for tests
- **Playwright** for e2e (`editor`, `dashboard`)
- **Yjs** 13.6.27 + `@domio/yjs-shared` workspace package
  (collab primitives) — `editor`
- **i18n** via `@domio/i18n` + `tools/i18n-check.mjs`

## 2. Apps (by purpose)

### Authoring

- **`editor`** — Figma-grade canvas + deck authoring. Routes: `/editor/[id]`,
  `/search`. CRDT integration. WebGL2/WebGPU/Canvas2D scene graph from
  `@domio/canvas`.
- **`api`** — HTTP/gRPC app facade (no UI).

### Reader / runtime

- **`viewer`** — public deck viewer. Routes: `/[deckId]`, `/demo`, `/kiosk`.
- **`presenter`** — presenter-mode app. Routes: `/pair`, `/session`.

### Insight

- **`dashboard`** — analytics workspace. 16 pages: `/ab`, `/alerts`,
  `/benchmarks`, `/cohorts`, `/crm`, `/csat`, `/deck/[id]`, `/deck`,
  `/export`, `/funnel`, `/graph`, `/heatmap`, `/heatmap/element`,
  `/kpis`, `/live`, `/overview`, `/sentiment`, `/sessions`,
  `/sessions/[id]`, `/team`. Plus `/api/export/[kind]` and
  `/api/graphql` API routes.

### Commerce / creator

- **`marketplace-web`** — public template/component marketplace. Routes:
  `/checkout`, `/creators`, `/library`, `/listing`, `/search`,
  `/sellers`, `/theme`.
- **`creator-console`** — creator-side management. Routes: `/analytics`,
  `/listings`, `/onboarding`, `/payouts`, `/reviews`, `/settings`,
  `/statements`.

### Enterprise

- **`admin-console`** — enterprise admin (32 routes): `/legal-hold`,
  `/sso`, `/api-keys`, `/audit`, `/billing`, `/brand-locks`,
  `/change-feed`, `/component-sdk`, `/custom-domains`, `/dlp`,
  `/webhooks`, `/trust`, `/agent-handoff`, `/api-explorer`,
  `/takedowns`, `/payouts`, `/plugins`, `/rendering`, `/residency`,
  `/retention`, …

### Marketing / landing

- **`landing`** — marketing site
- **`magic-link-landing`** — magic-link landing pages
- **`join-web`** — QR-join audience entry

## 3. Front-end workspace packages

`packages/` shared across all apps:

- `@domio/ui` — UI primitives
- `@domio/canvas` — scene graph
- `@domio/schema` — typed deck schema
- `@domio/yjs-shared` — CRDT helpers
- `@domio/api-client` — generated API client
- `@domio/sdk-ts` — public TS SDK
- `@domio/i18n` — i18n + RTL
- `@domio/web-security` — CSP + cookie hardening
- `@domio/components` — shared components
- `@domio/observability` — OTel SDK wiring
- `@domio/analytics-sdk` — analytics event SDK
- `@domio/chart` — chart components
- `@domio/tokens` — design tokens
- `@domio/theme` — theme helpers
- `@domio/animation-runtime` — animation runtime
- `@domio/easing` — easing curves
- `@domio/redact-pii` — PII redaction
- `@domio/agent-schema` — MCP schemas
- `@domio/common` — common utilities
- `@domio/schema-prop` — prop schema helpers
- `@domio/prompt-registry` — prompt templates
- `@domio/object-store` — object-store wrapper

## 4. Front-end roadmap / docs

- `docs/frontend/` — front-end deep dives
- `docs/frontend-roadmap/` — front-end delivery plan

## 5. CI

- `editor-e2e.yml` — editor Playwright
- `external-e2e.yml` — full-stack external e2e
- `a11y-i18n.yml` — accessibility + i18n checks
- `axe.yml` — axe-core a11y
- `dashboard-build.yml` — dashboard build
- `lint.yml`, `type.yml`, `unit.yml`, `integration.yml` — standard gates
