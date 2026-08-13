# Phase G — Presenter app (live presenting)

## Context

`apps/presenter/src/app/page.tsx` is a 30-line Phase 0 stub. The presenter
runtime (`apps/presenter/src/runtime/`) has 17 client modules already
written: timer, session-client, annotation-client, plan-client, rehearsal,
parking-lot-client, handoff-client, pip-window, offline-cache, recap-client,
whisper-client. None of them are reachable from `/`.

A presenter opens the app, sees a session picker, and lands in a multi-pane
view: current slide / next slide / notes / timer / audience preview / QR
pairing / annotations.

## Routes to build

| Route                             | Renders                                         |
| --------------------------------- | ----------------------------------------------- |
| `/`                               | Session-code entry (or list of recent sessions) |
| `/session/[id]`                   | Live presenter view                             |
| `/session/[id]?display=secondary` | Secondary display (audience preview + QR code)  |
| `/session/[id]/rehearsal`         | Rehearsal mode (no audience)                    |
| `/session/[id]/recap`             | Recap after the session                         |

## Files to change

### `apps/presenter/src/app/page.tsx`

Replace the stub with a real session-picker home page. Reuse the entry
form pattern from Phase F.

### `apps/presenter/src/app/session/[id]/page.tsx` (new)

Server component. Reads `id`, `display` query, fetches deck snapshot from
`apps/api` `/v1/sessions/[id]`. Renders `<PresenterView>`.

### `apps/presenter/src/app/session/[id]/PresenterView.tsx` (new)

Client component. Lays out the panes using the runtime clients:

```tsx
<PresenterShell>
  <SlidePane current={deck.slides[idx]} next={deck.slides[idx + 1]} />
  <NotesPane notes={deck.slides[idx].notes} />
  <TimerPane client={timer} />
  <AudiencePreviewPane ws={wsClient} />
  <AnnotationPane client={annotationClient} />
  <HandoffPane client={handoffClient} />
  <QrPairingPane code={pairingCode} />
</PresenterShell>
```

`PresenterShell` is a CSS-grid layout that hides the QR pairing pane when
`display=secondary` and shows it in big.

### `apps/presenter/src/app/session/[id]/rehearsal/page.tsx` (new)

Same layout but with `audiencePreview` and `annotationClient` disabled.

### `apps/presenter/src/app/session/[id]/recap/page.tsx` (new)

Fetches `recap-client` data and renders a summary: slides shown, time per
slide, engagement events, Q&A highlights.

## Service wiring (depends on Phase L)

`presenter-session` is at `http://presenter-session:3010` (already in
compose per the original plan). `apps/api` is at `http://api:3000`.

## Verification

1. Open `http://localhost:3002/` → session entry form.
2. Open `http://localhost:3002/session/demo` → full presenter view with
   the demo deck.
3. Open `/session/demo?display=secondary` → minimal QR + audience preview.
4. Rehearsal mode → no audience events.
5. Recap → renders after a session is ended.

## Risk / out of scope

- Co-presenting handoff: only the basic handoff client is wired; the
  full state-machine handoff is a later phase.
- Whisper mode (live captions): the `whisper-client` is wired but the
  STT provider needs Phase L.
