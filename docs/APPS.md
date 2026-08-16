# Domio — Apps catalog

> **Source of truth:** `apps/` (11 entries). **Last regenerated:** 2026-08-16.

All apps share Next.js 15.1.3 + React 19.0.0 + TypeScript 5.7.2. Tailwind
3.4 is the styling layer for the heavy apps. See `docs/FRONTEND.md` for the
shared front-end workspace packages and CI.

| App                   | Package                    | Routes / purpose                                    |
| --------------------- | -------------------------- | --------------------------------------------------- |
| `editor`              | `@domio/editor`            | `/editor/[id]`, `/search`                           |
| `viewer`              | `@domio/viewer`            | `/[deckId]`, `/demo`, `/kiosk`                      |
| `presenter`           | `@domio/presenter`         | `/pair`, `/session`                                 |
| `dashboard`           | `@domio/dashboard`         | 16 analytics pages + `/api/export/[kind]`, `/api/graphql` |
| `marketplace-web`     | `@domio/marketplace-web`   | `/checkout`, `/creators`, `/library`, `/listing`, `/search`, `/sellers`, `/theme` |
| `creator-console`     | `@domio/creator-console`   | `/analytics`, `/listings`, `/onboarding`, `/payouts`, `/reviews`, `/settings`, `/statements` |
| `admin-console`       | `@domio/admin-console`     | 32 enterprise admin routes                          |
| `landing`             | `@domio/landing`           | `/`                                                 |
| `magic-link-landing`  | `@domio/magic-link-landing`| Magic-link landing pages                            |
| `join-web`            | `@domio/join-web`          | Audience QR-join entry                              |
| `api`                 | `@domio/api`               | HTTP/gRPC facade (no UI)                            |

## Per-app CI

- **Editor** — `editor-e2e.yml` (Playwright)
- **Dashboard** — `dashboard-build.yml`
- **All apps** — `lint.yml`, `type.yml`, `unit.yml`, `integration.yml`,
  `external-e2e.yml`, `a11y-i18n.yml`, `axe.yml`