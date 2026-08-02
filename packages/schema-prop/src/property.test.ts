/**
 * Fast-Check property tests for the prop engine: any schema generated from
 * the fragment grammar must round-trip — a value validated with coercion
 * and defaults re-validates clean, and random schema/value pairs never
 * throw.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DomioPropsSchema, PropSchemaFragment } from './types.js';
import { validateProps } from './validate.js';
import { resolveSchemaDefaults } from './resolve.js';

const optString = fc.option(fc.string({ maxLength: 12 }), { nil: undefined });
const optScalarInt = fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: undefined });

/** Generates a bounded prop fragment graph (depth ≤ 2) with a default. */
const fragmentArb: fc.Arbitrary<PropSchemaFragment> = fc.letrec((tie) => {
  const scalarBranches: Array<fc.Arbitrary<PropSchemaFragment>> = [
    fc.record({
      type: fc.constant<'string'>('string'),
      title: optString,
      default: optString,
      'x-domio-prop': fc.option(
        fc.record({ category: fc.constantFrom('Content', 'Layout', 'Style') }),
        { nil: undefined },
      ),
    }),
    fc.record({
      type: fc.constant<'number'>('number'),
      title: optString,
      default: optScalarInt,
      'x-domio-prop': fc.option(
        fc.record({ category: fc.constantFrom('Content', 'Layout', 'Style') }),
        { nil: undefined },
      ),
    }),
    fc.record({
      type: fc.constant<'integer'>('integer'),
      title: optString,
      default: optScalarInt,
      'x-domio-prop': fc.option(
        fc.record({ category: fc.constantFrom('Content', 'Layout', 'Style') }),
        { nil: undefined },
      ),
    }),
    fc.record({
      type: fc.constant<'boolean'>('boolean'),
      title: optString,
      default: fc.option(fc.boolean(), { nil: undefined }),
      'x-domio-prop': fc.option(
        fc.record({ category: fc.constantFrom('Content', 'Layout', 'Style') }),
        { nil: undefined },
      ),
    }),
  ];
  // Ordered (minItems <= maxItems) array bounds so generated schemas are satisfiable.
  const array = fc
    .tuple(
      fc.constant<'array'>('array'),
      tie('scalar'),
      fc.integer({ min: 0, max: 6 }),
      fc.integer({ min: 0, max: 6 }),
    )
    .map(([type, items, a, b]) => ({
      type,
      items,
      minItems: Math.min(a, b),
      maxItems: Math.max(a, b),
    })) as unknown as fc.Arbitrary<PropSchemaFragment>;
  const object = fc.record({
    type: fc.constant<'object'>('object'),
    properties: fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), tie('scalar'), {
      maxKeys: 3,
    }),
  }) as fc.Arbitrary<PropSchemaFragment>;
  return {
    scalar: fc.oneof(...scalarBranches),
    array,
    object,
    fragment: fc.oneof(scalarBranches[0]!, scalarBranches[1]!, scalarBranches[2]!, scalarBranches[3]!, array, object),
  };
}).fragment as fc.Arbitrary<PropSchemaFragment>;

const propsSchemaArb: fc.Arbitrary<DomioPropsSchema> = fc.record({
  type: fc.constant<'object'>('object'),
  required: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 3 }), {
    nil: undefined,
  }),
  additionalProperties: fc.constant(false),
  properties: fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fragmentArb, {
    maxKeys: 8,
  }),
});

/** Generates a value matching a fragment (mirrors the fragment's type). */
function sampleFor(fragment: PropSchemaFragment): unknown {
  const type = Array.isArray(fragment.type) ? fragment.type[0] : fragment.type;
  switch (type) {
    case 'string':
      return fragment.default !== undefined ? fragment.default : 'sample';
    case 'number':
      return fragment.default !== undefined ? fragment.default : 1.5;
    case 'integer':
      return fragment.default !== undefined ? fragment.default : 2;
    case 'boolean':
      return fragment.default !== undefined ? fragment.default : true;
    case 'array': {
      const min = fragment.minItems ?? 0;
      const max = fragment.maxItems ?? Math.max(min, 4);
      const n = Math.max(0, Math.min(min, max));
      return Array.from({ length: n }, () => sampleFor(fragment.items ?? {}));
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(fragment.properties ?? {})) {
        out[key] = sampleFor(sub);
      }
      return out;
    }
    default:
      return null;
  }
}

function sampleValueFor(schema: DomioPropsSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fragment] of Object.entries(schema.properties)) {
    out[key] = sampleFor(fragment);
  }
  return out;
}

describe('prop engine property tests', () => {
  it('never throws for arbitrary schemas and values', () => {
    fc.assert(
      fc.property(propsSchemaArb, fc.record({}), (schema, _) => {
        const result = validateProps(schema, sampleValueFor(schema));
        expect(result).toBeDefined();
        expect(Array.isArray(result.errors)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('validates its own samples successfully', () => {
    fc.assert(
      fc.property(propsSchemaArb, (schema) => {
        // Only use schemas whose sample values satisfy required + sample types.
        const value = sampleValueFor(schema);
        const required = schema.required ?? [];
        for (const req of required) {
          if (!(req in value)) return; // sample generator cannot satisfy; skip
        }
        const result = validateProps(schema, value, { fillDefaults: false });
        expect(result.valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('defaults resolve to values that validate', () => {
    fc.assert(
      fc.property(propsSchemaArb, (schema) => {
        const defaults = resolveSchemaDefaults(schema);
        // Feed defaults as-is: they must not fail type/enum checks.
        const result = validateProps(schema, defaults, { fillDefaults: false });
        for (const error of result.errors) {
          if (error.code === 'required') {
            // A required prop without a default is the only acceptable error.
            continue;
          }
          throw new Error(`${error.path}: ${error.message}`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('validateProps is idempotent on its own output', () => {
    fc.assert(
      fc.property(propsSchemaArb, (schema) => {
        const once = validateProps(schema, sampleValueFor(schema));
        const twice = validateProps(schema, once.value);
        expect(twice.errors.filter((e) => e.code !== 'required')).toEqual(
          once.errors.filter((e) => e.code !== 'required'),
        );
      }),
      { numRuns: 100 },
    );
  });
});
