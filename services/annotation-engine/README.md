# @domio/annotation-engine

Phase 15 W4 — annotation engine.

## Purpose

Owns the **per-slide, per-session annotation overlay state**. Five ink tools:
`pen`, `highlighter`, `spotlight`, `zoom`, `blur`. Strokes are stored as
deterministic JSONB vectors (`{ strokes: [[{x, y, pressure, t}]] }`) so
they can be replayed identically across presenters.

## Layered model

- **Ephemeral** strokes are tied to a session and cleared on session end.
- **Saved overlays** are promoted to a slide and survive past the session.

## Mutation rules

1. Every stroke is appended through this service — never directly to the DB.
2. `expected_version` (etag) enforces optimistic concurrency on the
   presenter session row.
3. `Idempotency-Key` survives retries (24h TTL).
4. The hash-chained audit emitter logs `annotation.commit` / `annotation.rollback`.

## Usage (TS)

```ts
import { AnnotationService } from '@domio/annotation-engine';
const svc = new AnnotationService({ store, audit, idempotency });
await svc.commit({ session_id, slide_id, kind: 'pen', geometry, drawn_by }, ctx);
```