# MCP Server (Phase 13 M1)

The MCP (Model Context Protocol) server exposes Domio's deck engine as
a callable resource surface, so any MCP-compatible client — Claude, GPT,
third-party agents, internal automations — can list tools, call them
with JSON-RPC 2.0, and stream long-running responses over SSE.

M1 ships the **gateway + audit substrate + six read-only tools**.
M2 will add write tools (NL patch, image gen, ingest) and an Idempotency-Key
enforcement layer; M3 adds the agent runtime.

---

## Components

```
services/mcp-server/
├── cmd/mcp-server/main.go           # Entry point — wires registry + gateway + audit + store
├── internal/audit/                  # Hash-chained audit log (HMAC-SHA256)
├── internal/auth/                   # Principal + CapabilityScope types
├── internal/gateway/                # JSON-RPC 2.0 + SSE + RFC-7807 errors
├── internal/registry/               # Method-name → tool Spec
├── internal/store/                  # PGX-backed session / tool_call / audit persistence
└── internal/tools/                  # The 6 read-only tool handlers
```

The gateway is a chi router with the middleware ordering:
RealIP → RequestID → Recoverer → Heartbeat. JSON-RPC envelopes are
dispatched through `/mcp`; `POST /healthz` returns liveness.

---

## Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `8086` | TCP port the gateway listens on |
| `DATABASE_URL` | no | unset | Postgres DSN; falls back to `MemStore` when unset (dev only) |
| `AUDIT_HMAC_KEY` | **yes** | — | 32-byte hex-encoded HMAC key for audit-chain signing |
| `MCP_STATIC_TOKENS` | no | unset | `token:subject:workspace:scope1,scope2;…` (dev convenience) |

Generate an `AUDIT_HMAC_KEY`:

```sh
openssl rand -hex 32
```

---

## Wire format

### Request

```http
POST /mcp
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{"jsonrpc":"2.0","id":"1","method":"lint_deck","params":{"deck_id":"…"}}
```

### Success

```json
{"jsonrpc":"2.0","id":"1","result":{...}}
```

### Error

JSON-RPC error with an RFC-7807-style `data` field:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32002,
    "message": "missing required capability",
    "data": {"required_scope": "lint:deck", "principal": "u1"}
  }
}
```

Common codes: `-32700` parse, `-32600` invalid request, `-32601` method
not found, `-32602` invalid params, `-32603` internal, `-32001`
unauthorized, `-32002` forbidden (missing capability), `-32003`
tool unavailable, `-32004` idempotency conflict.

### Streaming

Tools that emit multi-chunk outputs stream back as
`text/event-stream`. Each event has an `event:` name and a `data:`
JSON payload. Terminal events: `event: done` (success) or
`event: error` (failure). A `: ping` heartbeat line is sent every
30 seconds when the gateway holds the connection open.

### Notifications

A request with `id: null` is a notification. The gateway invokes the
tool but returns `204 No Content` and writes no response body.

---

## The six M1 tools

| Tool | Required scopes | Description |
|------|-----------------|-------------|
| `lint_deck` | `read:deck`, `lint:deck` | Run layout/content lint rules over a deck JSON |
| `get_provenance` | `audit:read` | Return the universal audit quartet for a deck or slide |
| `semantic_search` | `read:deck`, `search:deck` | Top-K slides matching a query (token overlap in M1) |
| `get_claim_confidence` | `read:deck`, `claim:read` | Confidence score + evidence IDs for a citation claim |
| `accessibility_audit` | `read:deck`, `a11y:run` | WCAG-style a11y rules over a deck JSON |
| `check_freshness` | `claim:read` | Reports whether a data binding is stale |

Every successful result has a `tool_version: "p13-m1-v1"` field.
Inputs and outputs are JSON-Schema'd in
`contracts/mcp/tools/<tool>.input.schema.json` and
`contracts/mcp/tools/<tool>.output.schema.json`.

In M1 the four tools that *would* query the database
(`get_provenance`, `semantic_search`, `get_claim_confidence`,
`check_freshness`) return deterministic stubs. They exercise the
wire format end-to-end so the gateway, audit chain, and tool
registry can be validated without a live Postgres connection.

---

## Audit chain

Every tool call emits two events into the `agent_audit_event` table:

1. `tool_call.started` — emitted before the handler runs.
2. `tool_call.succeeded` or `tool_call.failed` — emitted after.

Events form a per-`(workspace_id, agent_session_id)` chain. Each
`hash` is `HMAC-SHA256(kid.key, canonical(payload) || seq || prev_hash)`,
hex-encoded. The genesis prev-hash is `SHA256("")`. The chain is
verifiable on demand:

```go
chain.VerifyChain(events) // returns *ErrHashMismatch or *ErrChainMismatch
```

Rotation uses a 7-day overlap: in-flight events signed under the old
key still verify after the rotation. The hard expiry is 90 days.

---

## Idempotency

`POST /mcp` accepts an `Idempotency-Key` header. M1 enforces the header
parse (validating format) but, since all six M1 tools are read-only,
the binding table is only exercised in M2. Write tools in M2 will use
`tool_call_idempotency` with `UNIQUE (session_id, idempotency_key)`.

---

## Health & observability

- `GET /healthz` — liveness, returns 200 with `{"status":"ok"}`.
- Every request emits a `tool_call.started` / `tool_call.succeeded`
  pair into the audit log. Operators can query the audit chain for
  recent activity.
- The `X-Request-ID` header is propagated end-to-end; the gateway
  attaches it as the request's `instance` field in problem-detail
  error responses.

---

## Local development

```sh
export AUDIT_HMAC_KEY=$(openssl rand -hex 32)
go run ./services/mcp-server/cmd/mcp-server
```

The service listens on `:8086`. A development bearer token is
auto-seeded:

```
dev-token-do-not-use-in-prod
```

Override with `MCP_STATIC_TOKENS`:

```sh
export MCP_STATIC_TOKENS='t1:u1:w1:read:deck,lint:deck;t2:u2:w1:read:deck'
```

---

## Test plan (M1 acceptance)

1. `go test -count=1 ./services/mcp-server/...` passes; `go vet` is clean.
2. Hash-chain tests detect tampering and reordering (`chain_test.go`).
3. JSON-RPC parse succeeds for a valid request, fails with the
   appropriate code on parse / version / missing-method errors.
4. Capability-gate tests confirm missing-scope requests return
   `CodeForbidden` with the `required_scope` data field.
5. End-to-end smoke:
   ```sh
   curl -X POST http://localhost:8086/mcp \
     -H "Authorization: Bearer dev-token-do-not-use-in-prod" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":"1","method":"lint_deck","params":{"deck_id":"d1"}}'
   ```
   The response is a JSON-RPC envelope with a `violations` array.
6. The database round-trip works: connect with `psql`, insert a
   session row + tool_call + audit_event, run the smoke above, and
   confirm the audit row appears.