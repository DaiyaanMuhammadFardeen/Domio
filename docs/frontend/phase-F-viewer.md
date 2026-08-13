# Phase F — Viewer app (audience read-only deck)

## Context

`apps/viewer/src/app/page.tsx` is a 17-line Phase 0 stub saying "Coming
soon". Audience members have no way to view a deck from a public link or
shared session. The animation runtime (`apps/viewer/src/animation/`),
ConsentBanner, and `demo/page.tsx` already exist; they just aren't
reachable from `/`.

## Routes to build

| Route            | Renders                                              |
| ---------------- | ---------------------------------------------------- |
| `/`              | Session-code entry → redirects to `/v/[token]`       |
| `/v/[token]`     | Read-only deck view (shared link)                    |
| `/embed/[token]` | Same as `/v/[token]` but stripped chrome for iframes |
| `/demo`          | Already exists; leave as-is                          |

## Files to change

### `apps/viewer/src/app/page.tsx`

```tsx
import { CodeEntryForm } from '@/components/CodeEntryForm';
export default function ViewerHomePage() {
  return (
    <main className="boot">
      <header className="boot__header">
        <h1>Open a shared deck</h1>
      </header>
      <CodeEntryForm
        action="/v"
        placeholder="Paste a share link or session code"
      />
    </main>
  );
}
```

### `apps/viewer/src/app/v/[token]/page.tsx` (new)

Server component. Fetches deck JSON from `embed-proxy` (or `share-api`) using
the token. Renders `<DeckViewer deck={deck} />`. If token invalid → 404.

### `apps/viewer/src/app/v/[token]/DeckViewer.tsx` (new)

Client component. Uses the existing `apps/viewer/src/animation/scroll-linked.ts`
to drive slide transitions. Wires `@domio/analytics-sdk` to fire `view_start`,
`view_end`, `slide_change` events to `event-ingest`. Wraps in `<ConsentBanner>`.

### `apps/viewer/src/app/embed/[token]/page.tsx` (new)

Same as `/v/[token]` but renders without `ConsentBanner` and without
the code-entry chrome — meant to be iframed.

## Service wiring (depends on Phase L)

`embed-proxy` is at `http://embed-proxy:8096` (read its `src/server.ts` to
confirm port). The viewer container reads `EMBED_PROXY_URL`.

## Verification

1. Open `http://localhost:3001/` → renders code-entry form.
2. Paste a known share token → renders the deck with scroll-linked animation.
3. Open `http://localhost:3001/embed/<token>` → renders minimal iframe-friendly view.
4. Analytics events arrive in ClickHouse `events` table.

## Risk / out of scope

- Auth: share tokens are anonymous. No identity required.
- Live shared-session sync: that's the presenter + participant-session flow
  (Phase G/H).
- Deep-link routing on individual slides: scope of Phase J.
