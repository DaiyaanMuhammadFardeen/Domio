/**
 * Domio schema — Phase 02 source of truth for the canonical structured
 * deck document. The package owns the JSON Schema files under
 * `contracts/schema/v1/`, generates TypeScript types, exposes
 * validation/migration primitives, and re-exports semantic-address APIs.
 */

export * from './version.js';
export * from './generated/scene-graph.js';
export * from './validate.js';
export * from './migrate.js';
export * from './registry.js';
export * from './versioning.js';
export * from './address.js';
