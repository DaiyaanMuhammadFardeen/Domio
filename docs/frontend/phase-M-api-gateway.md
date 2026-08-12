# Phase M — Control-plane API gateway audit + wire-up

## Context

`apps/api` (Hono, Node 22) is the gateway that all the consoles call.
It has ~50 route files under `apps/api/src/routes/` including
`p18/collab.ts`, `p18/permissions.ts`, `p18/suggestions.ts`, etc.

But many `/v1/...` endpoints the consoles call likely 404 because:
- The route file exists but isn't mounted in `apps/api/src/server.ts`.
- The route exists but proxies to a service that Phase L just brought up.
- The route is a stub that returns 501.

This phase audits and wires the gaps.

## Audit steps

```bash
# 1. List every route file
ls apps/api/src/routes/

# 2. Find what's actually mounted
cat apps/api/src/server.ts | grep -E "app\.(get|post|put|delete)"

# 3. Find every fetch the consoles make
grep -rE "fetch\(.*v1/" apps/dashboard apps/admin-console apps/creator-console \
  apps/marketplace-web apps/join-web apps/magic-link-landing apps/editor \
  apps/viewer apps/presenter | grep -oE 'v1/[a-z0-9/_-]+' | sort -u
```

The third command produces a list of endpoint paths the UIs assume
exist. Compare against step 2. Every UI-referenced endpoint that's not
mounted needs a route.

## Files to change

For each missing endpoint, either:

### Option A — Add a route to `apps/api/src/routes/<area>.ts`

For example, if `/v1/guests/redeem` is missing:

```ts
// apps/api/src/routes/p18/guests.ts
import { Hono } from 'hono';
const r = new Hono();
r.post('/v1/guests/redeem', async (c) => {
  const body = await c.req.json();
  const res = await fetch(`${process.env.GUESTS_URL}/v1/guests/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return c.json(await res.json(), res.status as 200 | 400 | 401 | 403 | 404);
});
export default r;
```

### Option B — Mount an existing-but-unmounted route

If the file exists but isn't in `server.ts`, just add the import + `app.route('/', r)`.

## Likely gap list (verify by running the audit)

These are the endpoints I expect to be missing based on the route
filenames and console fetches:

- `/v1/decks` — list/create decks (Phase A)
- `/v1/decks/[id]` — get one deck (Phase A)
- `/v1/sessions/[id]` — session details (Phase G)
- `/v1/sessions/by-code/[code]` — session lookup (Phase H)
- `/v1/guests/redeem` — guest invite redeem (Phase J)
- `/v1/marketplace/listings` — listings (marketplace-web)
- `/v1/marketplace/brand-locks` — brand-lock list (admin-console)
- `/v1/takedowns` — takedown queue (admin-console)
- `/v1/payouts` — payout runs (admin-console)
- `/v1/team/templates/top` — Phase B
- `/v1/team/components/top` — Phase B
- `/v1/team/brands/health` — Phase B
- `/v1/team/retention` — Phase B
- `/v1/experiments` — Phase B
- `/v1/experiments/[id]/measurements` — Phase B
- `/v1/experiments/[id]/stats` — Phase B
- `/v1/health/stats` — Phase B

## Verification

```bash
# 1. Audit script (write as tests/beta/api-coverage.sh)
# Compares UI-referenced endpoints vs mounted endpoints. Must report 0 gaps.

# 2. Manual smoke
for path in /v1/decks /v1/sessions/by-code/demo /v1/guests/redeem \
            /v1/marketplace/listings /v1/team/templates/top /v1/experiments; do
  curl -s -o /dev/null -w "%{http_code} $path\n" "http://localhost:3010$path"
done
# All must NOT be 404
```

## Risk / out of scope

- Auth: most endpoints will be open until an auth phase lands.
- Pagination: wire `?limit=&cursor=` if a console uses it.
- Webhooks (Stripe etc.): not in scope.
