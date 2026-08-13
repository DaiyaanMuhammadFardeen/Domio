unit: editor
owner: editor-platform@example.com
stride:
S:
score: 4
notes: - Editor sessions are signed with a per-user ephemeral key
fetched from /v1/session; refresh requires re-auth.
T:
score: 4
notes: - Document mutations go through a CRDT (Yjs) — server only stores
opaque update payloads, never re-interprets them client-side.
R:
score: 2
notes: - The CRDT carries enough provenance that any tampering shows up
as a conflict, not as silent data loss.
I:
score: 9
notes: - All network payloads are inspected for PII before being stored
in the trace stream. - Snapshot exports do not include the `creator` field unless the
viewer is also the creator.
D:
score: 6
notes: - Auto-save throttle: 1 write per 800 ms per doc. - Offline buffer caps at 5 MB per client before forcing flush.
E:
score: 6
notes: - Plugin hosts are fully sandboxed (Web Worker + capability
manifests); no DOM access without an explicit grant.
