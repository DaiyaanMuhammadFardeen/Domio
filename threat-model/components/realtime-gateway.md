unit: realtime-gateway
owner: realtime-platform@example.com
stride:
S:
score: 4
notes: - WebSocket upgrade requires a short-lived ticket from
api-gateway; ticket is bound to source IP and TTL. - Reconnection requires the same signed principal; tickets do
not transfer across users.
T:
score: 6
notes: - Realtime messages carry a sequence number enforced server-side;
out-of-order or replayed frames are dropped. - Edits to shared state require a `version` field; older versions
return 409 Conflict.
R:
score: 4
notes: - All broadcasts include the original sender's opaque ID, and the
gateway logs the action with monotonic sequence.
I:
score: 6
notes: - Hub does not forward PII unless the recipient is in the
`allowed_viewers` ACL.
D:
score: 9
notes: - Per-connection rate limit: 50 messages/sec, 1000 burst. - Per-room fanout budget enforced at room-creation time.
E:
score: 4
notes: - Presence and `typing` notifications are not in scope for
elevation — only data-modifying ops are checked.

# Phase 04 additions — realtime collaboration & CRDT sync

## Authentication & session binding

- WebSocket upgrade requires a short-lived ticket from the API gateway,
  bound to the authenticated user's JWT, source IP, and a 30-second TTL.
- Reconnection reuses the same signed principal; tickets do not transfer
  across users or devices.
- Branch switch (`BranchSwitch` op) requires the requesting user to hold
  write permission on the target branch; the gateway verifies via gRPC
  call to the control plane before applying the switch.

## Idempotency & op validation

- Every op carries an `op_id` (ULID), `author_id`, `hlc`, and
  `parent_hlc`. The server validates HLC ordering and rejects
  reordered or replayed duplicates via `(op_id)` primary key.
- Submitting the same op multiple times results in a single apply;
  subsequent submissions return a no-op ack.
- Malformed ops (missing fields, invalid HLC, unauthorized author)
  are rejected with a structured error; no partial state mutation.

## Rate limits & DoS mitigation

- Per-connection rate limit: 50 messages/sec, 1000 burst (existing);
  cursor updates throttled to 30 Hz client-side.
- Chat messages rate-limited to 1 per 2 seconds per user; pointer
  pings rate-limited to 1 per 2 seconds per user.
- Per-room fanout budget enforced at room-creation time; exceeding
  the budget triggers connection eviction for the lowest-privilege
  session.

## Presence privacy

- Cursor positions, selection outlines, and avatar chips are broadcast
  only to users with read access on the deck (verified via the ACL
  check on join).
- Cursor chat messages are visible only to users currently in the same
  deck session; no persistent storage of chat content.
- Pointer ping ring animations are ephemeral and not logged or stored.
- The `presence_sessions` table stores only `session_id`, `deck_id`,
  `user_id`, `branch_id`, `color`, `connection_id`, and `last_seen_at`;
  no cursor coordinates or chat text is persisted.

## CRDT log integrity

- The CRDT log (`crdt_logs` table) is append-only; the gateway never
  deletes or modifies committed ops.
- Branch isolation: ops on branch B are never applied to branch A;
  `branch_id` is validated against the deck's branch registry.
- Offline reconnect replay sends the client's vector HLC gap to the
  server; the server replays only the missing ops, preventing
  full-log exfiltration.
