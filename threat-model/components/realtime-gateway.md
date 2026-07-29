unit: realtime-gateway
owner: realtime-platform@example.com
stride:
  S:
    score: 4
    notes:
      - WebSocket upgrade requires a short-lived ticket from
        api-gateway; ticket is bound to source IP and TTL.
      - Reconnection requires the same signed principal; tickets do
        not transfer across users.
  T:
    score: 6
    notes:
      - Realtime messages carry a sequence number enforced server-side;
        out-of-order or replayed frames are dropped.
      - Edits to shared state require a `version` field; older versions
        return 409 Conflict.
  R:
    score: 4
    notes:
      - All broadcasts include the original sender's opaque ID, and the
        gateway logs the action with monotonic sequence.
  I:
    score: 6
    notes:
      - Hub does not forward PII unless the recipient is in the
        `allowed_viewers` ACL.
  D:
    score: 9
    notes:
      - Per-connection rate limit: 50 messages/sec, 1000 burst.
      - Per-room fanout budget enforced at room-creation time.
  E:
    score: 4
    notes:
      - Presence and `typing` notifications are not in scope for
        elevation — only data-modifying ops are checked.
