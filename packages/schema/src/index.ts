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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export interface ContractBundle {
  deck: unknown;
  sceneGraph: unknown;
  common: unknown;
}

let cachedBundle: ContractBundle | null = null;

/**
 * Loads the JSON Schema contracts committed to `contracts/schema/v1/`.
 * The path is computed relative to this package so it works from the
 * workspace root, from `pnpm --filter`, and from compiled output.
 */
export function loadContracts(): ContractBundle {
  if (cachedBundle) return cachedBundle;
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaRoot = resolve(here, '../../../../contracts/schema/v1');
  const deck = JSON.parse(readFileSync(resolve(schemaRoot, 'deck.schema.json'), 'utf8'));
  const sceneGraph = JSON.parse(
    readFileSync(resolve(schemaRoot, 'scene-graph.schema.json'), 'utf8'),
  );
  const common = JSON.parse(readFileSync(resolve(schemaRoot, 'common.schema.json'), 'utf8'));
  cachedBundle = { deck, sceneGraph, common };
  return cachedBundle;
}