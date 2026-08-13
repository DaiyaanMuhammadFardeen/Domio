# Phase H — Join-web (audience mobile PWA)

## Context

`apps/join-web/src/app/page.tsx` is 16 lines that renders `<JoinForm>`
inside `<MobileShell>` but the form is wired to a no-op. The runtime
(`apps/join-web/src/runtime/`) has `join-client`, `device-id`, `ws-client`,
and event publishers. None of the audience widgets (poll, qa, quiz,
word-cloud, raise-hand, sentiment, nav-vote, reaction) are wired in.

This is the mobile audience app: scan a QR, type a name, join a session,
and answer whatever the presenter puts on screen.

## Routes to build

| Route                   | Renders                                          |
| ----------------------- | ------------------------------------------------ |
| `/`                     | Join form (already exists, needs wiring)         |
| `/join/[code]`          | Live widget stream once joined                   |
| `/join/[code]/results`  | After-session results (poll tallies, quiz score) |
| `/manifest.webmanifest` | PWA manifest (already exists)                    |

## Files to change

### `apps/join-web/src/app/page.tsx`

Make `JoinForm.onSubmit` actually `router.push('/join/' + code)`. Set the
device id cookie via `device-id.ts` so reconnects are stable.

### `apps/join-web/src/app/join/[code]/page.tsx` (new)

Server component. Reads `code` query. Fetches the session from
`apps/api` `/v1/sessions/by-code/[code]`. If invalid → renders "Session
not found, scan the QR again". If valid, renders `<LiveStream>`.

### `apps/join-web/src/app/join/[code]/LiveStream.tsx` (new)

Client component. Connects via `ws-client` to `participant-session`. Subscribes
to events: `widget_show`, `widget_hide`, `reaction_burst`. Renders whichever
widget the presenter currently has on screen:

```tsx
{
  session.currentWidget === 'poll' && <PollWidget poll={session.activePoll} />;
}
{
  session.currentWidget === 'qa' && <QaWidget qa={session.activeQa} />;
}
{
  session.currentWidget === 'quiz' && <QuizWidget quiz={session.activeQuiz} />;
}
{
  session.currentWidget === 'cloud' && (
    <WordCloudWidget cloud={session.activeCloud} />
  );
}
{
  session.currentWidget === 'hand' && <RaiseHandWidget session={session} />;
}
{
  session.currentWidget === 'vote' && (
    <NavVoteWidget vote={session.activeVote} />
  );
}
{
  session.currentWidget === 'reaction' && <ReactionWidget />;
}
```

Each widget posts back via `ws-client.send({ type: 'widget_response', ... })`.

### `apps/join-web/src/app/join/[code]/results/page.tsx` (new)

Server component. Fetches results from `audience-service` and renders
them: which poll option won, your quiz score, your Q&A upvotes received.

## Service wiring (depends on Phase L)

`participant-session` at `http://participant-session:3011`.
`audience-service` at `http://audience-service:8097`.

## Verification

1. Open `http://localhost:3003/` → join form. Type `demo`, name `alice`.
2. Routes to `/join/demo` → renders empty widget area with "Waiting for the
   presenter to start".
3. From the presenter app (Phase G), open a poll. Reload `/join/demo` →
   widget switches to poll, vote options appear, click works.
4. After presenter ends the session, `/join/demo/results` shows your poll
   choice + quiz score.

## Risk / out of scope

- Native app wrappers (Capacitor / PWA install): the manifest already
  exists; we don't add native shell code in this phase.
- Auth: anonymous, device-id cookie is the only identity.
