import { Hono } from 'hono';

/**
 * Deck placeholder routes — Phase 0 wire-format verification.
 *
 * Returns a hard-coded demo deck so the editor can verify the end-to-end
 * flow without depending on the full schema (which lands in Phase 02).
 *
 * The contract is owned by `contracts/openapi/v1/decks.yaml` and
 * `contracts/proto/domio/v1/deck.proto`. This implementation is the
 * minimum to satisfy those contracts.
 */

const decks = new Hono();

decks.get('/:org_id/:tenant_id/:deck_id', (c) => {
  const { org_id, tenant_id, deck_id } = c.req.param();
  const traceId = c.req.header('x-trace-id') ?? crypto.randomUUID();
  return c.json({
    summary: {
      id: {
        kind: 'deck',
        org_id,
        tenant_id,
        id: deck_id,
      },
      title: 'Demo deck',
      status: 'draft',
      slide_count: 0,
      owner_user_id: 'demo-user',
      last_modified_ms: Date.now(),
      schema_version: 'v0',
    },
    tenant_id,
    trace_id: traceId,
  });
});

export { decks as deckRoutes };
