/**
 * Default resolution — computes the effective default for a prop fragment:
 * explicit `default` wins; otherwise the first `enum` member; otherwise the
 * first `oneOf`/`anyOf` branch's default.
 */

import type { DomioPropsSchema, PropSchemaFragment } from './types.js';

/**
 * Returns the effective default for a fragment, or `undefined` when the
 * fragment has no default.
 */
export function resolveFragmentDefault(fragment: PropSchemaFragment): unknown {
  if (fragment.default !== undefined) return clone(fragment.default);
  if (fragment.enum !== undefined && fragment.enum.length > 0) return clone(fragment.enum[0]);
  if (fragment.const !== undefined) return clone(fragment.const);
  if (fragment.oneOf && fragment.oneOf.length > 0) {
    return resolveFragmentDefault(fragment.oneOf[0] as PropSchemaFragment);
  }
  if (fragment.anyOf && fragment.anyOf.length > 0) {
    return resolveFragmentDefault(fragment.anyOf[0] as PropSchemaFragment);
  }
  if (fragment.type === 'object' && fragment.properties) {
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(fragment.properties)) {
      const dflt = resolveFragmentDefault(sub);
      if (dflt !== undefined) out[key] = dflt;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (fragment.type === 'array' && fragment.items) {
    // No default for arrays unless explicitly declared.
    return undefined;
  }
  return undefined;
}

/** Builds a full props value from the schema's defaults. */
export function resolveSchemaDefaults(schema: DomioPropsSchema | PropSchemaFragment): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fragment] of Object.entries(schema.properties ?? {})) {
    out[key] = resolveFragmentDefault(fragment);
  }
  return out;
}

/** Merges defaults under any value, preferring the provided keys. */
export function applyDefaults(schema: DomioPropsSchema, value: Record<string, unknown>): Record<string, unknown> {
  return { ...resolveSchemaDefaults(schema), ...value };
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
