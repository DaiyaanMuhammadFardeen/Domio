# ADR-2026-005: Component prop schemas use JSON Schema (draft 2020-12)

## Status

`accepted`

## Date

2026-08-02

## Context

Marketplace components need a declarative contract for their configurable
surface (props): the editor's PropsPanel must render controls, validation must
happen server-side before install, AI agents must be able to read and write
props, and template placeholders must bind to prop paths. The ecosystem must
support smart components (sane defaults, inferred props on promotion), variant
matrices, and versioned schemas that survive package upgrades.

The candidates were: TypeScript types as the source of truth, a hand-rolled
prop DSL, and JSON Schema. TypeScript types are erased at runtime and cannot be
shared with non-TS consumers (Go/Python agents, MCP tools). A custom DSL adds
authoring + tooling cost for no benefit over a standards-based option. JSON
Schema is a widely-adopted standard with existing tooling and a well-defined
metaschema.

## Decision

We will use **JSON Schema draft 2020-12** as the prop schema language for all
component packages, smart components, and templates.

- Prop schemas are stored in `props_schema` (JSONB) and versioned with the
  package (`component_package_v1.schema.json` in `contracts/schema/v1/`).
- `@domio/schema-prop` implements the subset the product needs: `type`,
  `enum`, `default`, `required`, `additionalProperties`, `min/max` (numbers,
  strings, arrays), `items`, `properties`, `oneOf`/`anyOf`, and `format`
  (`color`, `color-with-alpha`, `font-family`, `asset-ref`, `data-binding`,
  `enum-friendly-name`).
- Custom UI intent is carried in the `x-domio-prop` annotation object
  (category, control, live-preview, step/min/max/unit/placeholder). Unknown
  annotations are ignored, preserving forward compatibility.
- Extra properties are rejected when `additionalProperties: false`; otherwise
  they are preserved so upgraded packages can read legacy props.
- Schema evolution is additive: a new version may add props or widen defaults,
  but may not remove or retype an existing prop key without a major version.

## Alternatives considered

- **TypeScript-first**: rejected — no runtime schema, not consumable by Go/Python/MCP.
- **Custom prop DSL**: rejected — authoring/tooling cost, no ecosystem.
- **JSON Schema 2019-09**: rejected — 2020-12 is the current stable draft with
  better `prefixItems`/`dependentRequired` support if needed later.

## Consequences

- Server and editor share one validator (`@domio/schema-prop`), so a package
  that validates at publish also renders in the editor.
- 2020-12 metaschema files must be available for strict AJV compilation; the
  repo's contract tests strip `$schema` and compile with ajv 8 + ajv-formats.
