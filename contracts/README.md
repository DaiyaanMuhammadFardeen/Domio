# Domio Contracts

> **The wire-format source of truth.** Every cross-service contract lives
> here, in a form that humans can read and tools can compile. Generated
> clients are committed at `gen/` and `packages/api-client/src/gen/`.

---

## Layout

```
contracts/
├── proto/                    # Protobuf (Buf-managed)
│   ├── buf.yaml              # Lint + breaking-change rules
│   ├── buf.gen.yaml          # Code generators
│   └── domio/
│       └── v1/
│           ├── common.proto  # ResourceId, Money, Error, Idempotency
│           ├── health.proto  # Healthz, Readiness
│           └── deck.proto    # Placeholder deck surface (P02 expands)
├── openapi/                  # REST API
│   └── v1/
│       ├── common.yaml       # Health, Error, ResourceId, Page
│       └── decks.yaml        # Placeholder deck REST surface
└── schema/                   # JSON Schema for document payloads
    └── v1/
        ├── common.schema.json
        └── deck-placeholder.schema.json
```

---

## Contract rule (non-negotiable)

See `docs/adr/0003-contract-first.md` for the full decision record.

1. Every cross-service boundary uses **Protobuf for internal traffic**
   and **REST + OpenAPI for external traffic**.
2. **Generated clients are committed** — never re-implement by hand.
3. **Breaking changes** require an ADR + 90-day deprecation window.
4. **Backwards-compatible changes** require a 24-hour review window in
   `#domio-contracts`; silence = consent.
5. **Schema validation** is mandatory at the API boundary.

---

## CI gates

- `buf lint contracts/proto` — style + lint.
- `buf breaking contracts/proto --against '.git#branch=main'` — no
  breaking changes within a major version.
- `redocly lint contracts/openapi/v1` — OpenAPI style.
- `ajv validate -s contracts/schema/v1/*.json -d fixtures/*.json` — JSON
  Schema validation.
- `pnpm gen --check` — generated clients are up to date.

---

## Adding a new contract

1. Pick the right format:
   - **Service-to-service RPC?** Protobuf.
   - **External REST?** OpenAPI.
   - **Document payload (deck, theme, brand kit)?** JSON Schema.
2. Author the contract in the right file.
3. Run `pnpm gen`.
4. Commit the contract **and** the regenerated clients.
5. If the change is breaking, write an ADR first.

---

## Versioning

- Protobuf packages use `domio.v1`, `domio.v2`, … No major-version
  bump within a year of the previous one unless absolutely required.
- OpenAPI specs are versioned in the file path (`v1`, `v2`).
- JSON Schema `$id` includes the version (`v1`, `v2`).