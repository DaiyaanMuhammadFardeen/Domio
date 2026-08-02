/**
 * Server-only contract loader.
 *
 * Imports `node:fs`/`node:url`/`node:path` to read the canonical JSON Schema
 * files under `contracts/schema/v1/`. Kept OUT of the barrel entry so that
 * client bundles never pull Node built-ins into the editor/viewer.
 *
 * Use `import { loadContracts } from '@domio/schema/contracts'` in server
 * code; the main `@domio/schema` entry remains fully client-safe.
 */

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
