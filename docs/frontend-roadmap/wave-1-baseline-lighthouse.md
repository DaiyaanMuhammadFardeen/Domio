# Wave 1 — Lighthouse Baseline

**Status**: Config wired, baseline run deferred.

Per Wave 1 §F of `docs/frontend-roadmap/01-wave-productionization.md`.

## Config

- `.lighthouserc.json` at the repo root targets the 6 dev URLs the apps
  boot on by default.
- Accessibility budget: `minScore: 0.9` (i.e. ≥ 90).
- Settings: `preset: "desktop"`, `chromeFlags: "--no-sandbox --headless"`.

## Scripts

- `pnpm lhci` — full autorun (collect + assert + upload).
- `pnpm lhci:collect` — only collect.
- `pnpm lhci:assert` — only assert.

`@lhci/cli` is not yet installed in this repo; the install lands with
Wave 2's CI infra ticket.

## Baseline run (deferred)

The baseline run requires all 6 dev servers booted on their canonical
ports simultaneously. Wave 1 records the config and budgets. Wave 2
will add the `lhci.yml` job that boots the apps, runs `pnpm lhci`, and
records the per-app scores below.

### Recorded scores

| App             | Performance | Accessibility | Best Practices | SEO       |
| --------------- | ----------- | ------------- | -------------- | --------- |
| editor          | _pending_   | _pending_     | _pending_      | _pending_ |
| viewer          | _pending_   | _pending_     | _pending_      | _pending_ |
| presenter       | _pending_   | _pending_     | _pending_      | _pending_ |
| dashboard       | _pending_   | _pending_     | _pending_      | _pending_ |
| admin-console   | _pending_   | _pending_     | _pending_      | _pending_ |
| marketplace-web | _pending_   | _pending_     | _pending_      | _pending_ |

## Acceptance gate (deferred)

> Lighthouse ≥ 95 OR recorded as baseline below 95 with a Wave-2
> follow-up ticket.

Wave 1 baseline records the config exists. Wave 2 will record the
actual numbers and any tickets raised for below-threshold scores.
