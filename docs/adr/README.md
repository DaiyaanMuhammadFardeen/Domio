# Architecture Decision Records

This directory contains all ADRs for the Domio platform. ADRs are
immutable; superseded ADRs link to their replacements and remain in
the directory for historical context.

## ADR index

| ID | Title | Status | Date |
|---:|---|---|---|
| [0000](0000-template.md) | ADR template | n/a | — |
| [0001](0001-monorepo.md) | Adopt a single monorepo with polyglot toolchains | accepted | 2026-07-29 |
| [0002](0002-polyglot.md) | Adopt a polyglot backend with a non-negotiable contract rule | accepted | 2026-07-29 |
| [0003](0003-contract-first.md) | Contract-first wire formats with generated clients committed | accepted | 2026-07-29 |

## Process

1. Copy `0000-template.md` to `NNNN-short-title.md`.
2. Open a PR with the new ADR in `proposed` status.
3. Affected domain owners comment asynchronously for 2 business days.
4. Architecture Council (principal architect + affected leads +
   security/SRE) reviews and changes status to `accepted`,
   `rejected`, or defers.
5. Accepted ADRs are linked from the relevant super docs / domain docs.
6. Status changes (e.g., `superseded by ADR-NNNN`) update the index
   table above.

## Decision register

The single canonical list of decisions lives in this README's index
table. Cross-references from super docs and domain docs must use the
`ADR-NNNN` ID.