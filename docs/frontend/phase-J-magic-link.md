# Phase J — Magic-link landing (guest invite)

## Context

`apps/magic-link-landing` already has 300 lines. This phase is primarily
an audit + a wiring fix: verify the existing page actually does what its
package.json description says ("Landing page for Domio guest-invite magic
links. Phase 18 guest collaborators.") and make sure it doesn't 404 on
submit.

## Audit checklist (read these files first)

| File                                                        | Look for                                                |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `apps/magic-link-landing/src/app/page.tsx`                  | What does the form submit to?                            |
| `apps/magic-link-landing/src/app/page.tsx`                  | Does it read `?token=…` from the URL?                    |
| `apps/magic-link-landing/src/app/page.tsx`                  | Does it call `guests-service` `/v1/guests/redeem`?       |
| `services/guests/src/server.ts`                             | Is `/v1/guests/redeem` implemented?                      |
| `apps/api/src/routes/p18/guests.ts`                         | Does the gateway proxy to `guests-service`?              |

## Likely outcome

The 300 lines are probably a real implementation but it might:
- Use a placeholder submit handler
- Call `apps/api` with a wrong path
- Render the deck only after redeem succeeds but never confirm

## Files to change

### `apps/magic-link-landing/src/app/page.tsx`

Wire the form so:
1. It reads `?token=…` from the URL (or a path segment `/m/[token]`).
2. It auto-redeems on mount if the token is present.
3. It POSTs `/v1/guests/redeem` to `apps/api` → proxies to `guests-service`.
4. On success, renders the guest-only deck view (read-only, no edit
   controls, no comments).
5. On failure, renders a "This invite link is invalid or expired" page.

### New: `apps/magic-link-landing/src/app/m/[token]/page.tsx`

A nice-URL route that pre-populates the token form. Same component.

## Service wiring (depends on Phase L)

`guests-service` at `http://guests-service:8098`. `apps/api` proxies
`/v1/guests/*` → guests-service.

## Verification

1. Generate a guest invite from the editor (Phase A enables this once the
   share panel is hooked up — for now, seed an invite manually in the
   `guests` table).
2. Open the magic-link URL → form auto-redeems → deck renders in
   read-only mode.
3. Click an edit affordance → 403 / hidden (guests can't edit).
4. Open an expired token → "expired" message.

## Risk / out of scope

- This is mostly plumbing; the UI may already work, in which case this
  phase is a no-op + verification.
- Email delivery of invites is out of scope (the notification-dispatcher
  service handles that; it's a separate wiring question).