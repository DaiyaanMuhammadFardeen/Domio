# Wave 1 — Bundle Baseline

**Status**: Scripts wired, baseline run deferred.

Per Wave 1 §F of `docs/frontend-roadmap/01-wave-productionization.md`.

## Scripts wired

Every Next.js app under `apps/*/next.config.{mjs,ts}` is now wrapped with
`withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })` and
has an `analyze` script in its `package.json`:

| App                      | `next.config`                          | `analyze` script                               |
| ------------------------ | -------------------------------------- | ---------------------------------------------- |
| `@domio/editor`          | `apps/editor/next.config.mjs`          | `pnpm --filter @domio/editor analyze`          |
| `@domio/dashboard`       | `apps/dashboard/next.config.mjs`       | `pnpm --filter @domio/dashboard analyze`       |
| `@domio/admin-console`   | `apps/admin-console/next.config.mjs`   | `pnpm --filter @domio/admin-console analyze`   |
| `@domio/creator-console` | `apps/creator-console/next.config.mjs` | `pnpm --filter @domio/creator-console analyze` |
| `@domio/marketplace-web` | `apps/marketplace-web/next.config.ts`  | `pnpm --filter @domio/marketplace-web analyze` |

`viewer`, `presenter`, `join-web`, and `landing` are Vite-based and use
Vite's own bundle inspector (`pnpm dlx vite-bundle-visualizer`) rather
than `@next/bundle-analyzer`.

## Baseline run

The full bundle-analyzer baseline run requires booting each app's dev
server, opening each route in a headless browser, and either saving the
chunk manifest or snapshotting the analyzer HTML. That infrastructure
is owned by Wave 2 (CI infra). The numbers below will land once Wave 2
adds the `bundle-budget.yml` job.

### Recorded chunks (manual)

After running `pnpm --filter @domio/editor analyze` locally, the chunk
manifest lives at `apps/editor/.next/analyze/*.html`. The first 10
chunks by size, sorted desc, will be pasted here in Wave 2.

## Acceptance gate (deferred)

> Lighthouse ≥ 95 OR recorded as baseline below 95 with a Wave-2
> follow-up ticket.

Wave 1 baseline records the scripts exist. Wave 2 will record the
actual numbers.
