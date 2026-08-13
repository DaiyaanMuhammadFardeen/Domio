# @domio/editor

Domio canvas editor — Next.js 15 + Vite + WebGL2/WebGPU + Yjs CRDT.
Reactive decks with live-data bindings, branching flows, brand-aware
NL patches, and the registry-driven left rail.

## Owner

Canvas & Editor team (Stream F:CRDT).

## Runtime

- **Framework**: Next.js 15 (App Router).
- **UI**: React 19.
- **Styling**: plain CSS variables (no design system yet).

## What ships in Phase 0

- A landing page at `http://localhost:3000` that says "Domio editor —
  phase 0 boot" and links to the API health/ready/deck endpoints.
- `pnpm dev` brings it up.

## Future work

- Phase 02: real deck schema + scene graph integration.
- Phase 03: Vite-driven canvas, WebGL2/WebGPU renderer, layers, history.
- Phase 04: Yjs CRDT + presence channel.
- Phase 05: durable op log + branches + history.
