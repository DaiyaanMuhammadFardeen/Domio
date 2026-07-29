unit: nats
owner: data-platform@example.com
stride:
  S:
    score: 4
    notes:
      - Subject credentials are Vault-issued per service. No static NKEYs
        are committed.
  T:
    score: 4
    notes:
      - Message payloads are signed with HMAC-SHA256 by the publisher;
        subscribers verify before processing.
  R:
    score: 4
    notes:
      - JetStream streams retain a hash of each message sequence so any
        downstream tampering shows up as a mismatch.
  I:
    score: 6
    notes:
      - Streams are namespaced by tenant; cross-tenant access requires
        elevated scope and is logged.
  D:
    score: 6
    notes:
      - Streams have hard memory limits; back-pressure returns
        `ErrSlowConsumer` to publishers.
  E:
    score: 6
    notes:
      - Subjects are scoped per environment
        (`prod.api-gateway.events` vs `dev.api-gateway.events`); cross
        environment access requires an explicit `external` account.
