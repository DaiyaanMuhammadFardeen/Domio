# Phase K — Creator-console landing + routing

## Context

`apps/creator-console` has 4 routes (`/listings`, `/analytics`,
`/statements`, `/settings`) totaling 1363 lines of real code, but no root
`page.tsx`. Visiting `/` 404s. The user can't reach any of the four
sub-pages from the address bar.

## Files to change

### `apps/creator-console/src/app/page.tsx` (new)

A landing dashboard that:
1. Fetches overview stats (parallel calls to listings/analytics/statements).
2. Shows KPI tiles: active listings, gross revenue (last 30d), pending
   statements.
3. Renders a quick-nav grid to `/listings`, `/analytics`, `/statements`,
   `/settings` (mirror of admin-console's pattern).

```tsx
'use client';
import { useEffect, useState } from 'react';
import { KpiTile } from '../components/KpiTile';
import { fetcher } from '../lib/fetcher';

export default function CreatorOverviewPage() { /* mirror admin-console */ }
```

### `apps/creator-console/src/components/Header.tsx`

Add a small "Overview" link that points at `/` so users can always return.

### `apps/creator-console/src/components/Sidebar.tsx`

Verify it already lists all 4 routes. If not, add them.

## Service wiring (depends on Phase L)

`creator-analytics` at `http://creator-analytics:8099`. `marketplace` at
`http://marketplace:8100`. `creator-console` already has `fetcher.ts`
that needs the env URL wired.

## Verification

1. Open `http://localhost:3007/` (creator-console dev port, verify in
   package.json) — renders overview dashboard.
2. Click each nav link → routes to the existing pages without 404.
3. Verify the existing pages still load real data (not stubs).

## Risk / out of scope

- This is a routing fix, not a feature build.
- The 4 sub-pages may themselves have stub fallbacks — those are
  separate phases per app.