# MCP tool contracts

This directory contains the JSON-RPC 2.0 contracts for the MCP server's
M1 read-only tools.

## Layout

- `tools/<tool>.input.schema.json` — JSON Schema 2020-12 for the
  JSON-RPC `params` object.
- `tools/<tool>.output.schema.json` — JSON Schema for the `result`
  object returned by the gateway.

## Tools (M1)

All M1 tools are **read-only**. They require the following capabilities
on the bearer token:

| Tool                   | Required scopes            |
| ---------------------- | -------------------------- |
| `lint_deck`            | `read:deck`, `lint:deck`   |
| `get_provenance`       | `audit:read`               |
| `semantic_search`      | `read:deck`, `search:deck` |
| `get_claim_confidence` | `read:deck`, `claim:read`  |
| `accessibility_audit`  | `read:deck`, `a11y:run`    |
| `check_freshness`      | `claim:read`               |

## Wire format

Requests are JSON-RPC 2.0 envelopes:

```json
{"jsonrpc":"2.0","id":"1","method":"lint_deck","params":{...}}
```

Successful responses are JSON-RPC 2.0 envelopes:

```json
{"jsonrpc":"2.0","id":"1","result":{...}}
```

Error responses use the JSON-RPC error object with an RFC-7807-style
`data` field. Common codes:

| Code   | Meaning                        |
| ------ | ------------------------------ |
| -32700 | Parse error (invalid JSON)     |
| -32600 | Invalid request                |
| -32601 | Method not found               |
| -32602 | Invalid params                 |
| -32603 | Internal error                 |
| -32001 | Unauthorized                   |
| -32002 | Forbidden (missing capability) |
| -32003 | Tool unavailable               |
| -32004 | Idempotency conflict           |

## Streaming

For tools that produce large or multi-chunk outputs (currently none in
M1), the gateway can stream results back as `text/event-stream`. Each
SSE event has an `event:` name and a `data:` JSON payload. The terminal
event is `event: done` (or `event: error` on failure).

## Tool version

Every successful response includes a `tool_version` field set to
`p13-m1-v1`. Bump this string when a tool's contract changes
in a non-backward-compatible way.
