import { describe, it, expect } from 'vitest';
import type { DomioPropsSchema } from './types.js';
import { validateProps } from './validate.js';
import { applyDefaults, resolveSchemaDefaults } from './resolve.js';
import { inferControl, controlDescriptors } from './controls.js';

const STAT_CARD_SCHEMA: DomioPropsSchema = {
  $id: 'domio.stat-card/props/1.0.0',
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: {
    value: { type: 'number', title: 'Value', minimum: 0, 'x-domio-prop': { category: 'Content' } },
    label: { type: 'string', title: 'Label', default: 'Metric', 'x-domio-prop': { category: 'Content' } },
    unit: {
      type: 'string',
      title: 'Unit',
      enum: ['none', 'k', 'M', '%', '$'],
      default: 'none',
      'x-domio-prop': { category: 'Content' },
    },
    accent: {
      type: 'string',
      title: 'Accent',
      format: 'color',
      default: '#4F46E5',
      'x-domio-prop': { category: 'Style' },
    },
    showDelta: {
      type: 'boolean',
      title: 'Show delta',
      default: false,
      'x-domio-prop': { category: 'Behavior' },
    },
  },
};

describe('validateProps', () => {
  it('accepts valid props and returns defaults-filled value', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: 42 });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({
      value: 42,
      label: 'Metric',
      unit: 'none',
      accent: '#4F46E5',
      showDelta: false,
    });
  });

  it('rejects a missing required prop', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { label: 'Revenue' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'required' && e.path === 'value')).toBe(true);
  });

  it('rejects extra props when additionalProperties is false', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: 1, sneaky: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'additional_properties')).toBe(true);
  });

  it('rejects out-of-range numbers', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: -5 });
    expect(result.errors.some((e) => e.code === 'min')).toBe(true);
  });

  it('rejects bad enum values', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: 5, unit: 'bogus' });
    expect(result.errors.some((e) => e.code === 'enum')).toBe(true);
  });

  it('rejects invalid color format values', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: 5, accent: 'not-a-color' });
    expect(result.errors.some((e) => e.code === 'format')).toBe(true);
  });

  it('coerces string numbers when coerce is enabled', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: '42' }, { coerce: true });
    expect(result.valid).toBe(true);
    expect(result.value.value).toBe(42);
  });

  it('does not coerce when coerce is disabled', () => {
    const result = validateProps(STAT_CARD_SCHEMA, { value: '42' }, { coerce: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'type')).toBe(true);
  });

  it('runs well under the 5ms p99 budget for a 40-prop schema', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [
          `prop_${i}`,
          { type: 'string', default: `value ${i}` },
        ]),
      ),
    };
    const start = performance.now();
    for (let i = 0; i < 100; i += 1) {
      validateProps(schema, {});
    }
    const elapsed = performance.now() - start;
    expect(elapsed / 100).toBeLessThan(5);
  });

  it('validates nested object props recursively', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          properties: {
            year: { type: 'integer' },
            qtr: { type: 'integer', minimum: 1, maximum: 4 },
          },
          required: ['year'],
        },
      },
    };
    const bad = validateProps(schema, { target: { year: 2026, qtr: 9 } });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'target.qtr')).toBe(true);
    const good = validateProps(schema, { target: { year: 2026 } });
    expect(good.valid).toBe(true);
  });

  it('validates repeatable arrays against the items schema', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } }, required: ['label'] },
        },
      },
    };
    expect(validateProps(schema, { points: [{ label: 'a', value: 1 }] }).valid).toBe(true);
    const tooMany = validateProps(schema, { points: Array.from({ length: 7 }, () => ({ label: 'x' })) });
    expect(tooMany.errors.some((e) => e.code === 'max_items')).toBe(true);
    const missing = validateProps(schema, { points: [{ value: 1 }] });
    expect(missing.errors.some((e) => e.code === 'required')).toBe(true);
  });

  it('validates oneOf discriminated unions', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        delta: {
          oneOf: [
            { type: 'number' },
            { type: 'string', format: 'color' },
          ],
        },
      },
    };
    expect(validateProps(schema, { delta: 5 }).valid).toBe(true);
    expect(validateProps(schema, { delta: '#FF0000' }).valid).toBe(true);
    const bothFail = validateProps(schema, { delta: { nope: true } });
    expect(bothFail.errors.some((e) => e.code === 'one_of')).toBe(true);
  });
});

describe('resolveSchemaDefaults', () => {
  it('uses explicit defaults and enum-first fallbacks', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        hasDefault: { type: 'string', default: 'hello' },
        enumOnly: { type: 'string', enum: ['a', 'b'] },
        noDefault: { type: 'number' },
        nested: {
          type: 'object',
          properties: { inner: { type: 'string', default: 'in' } },
        },
      },
    };
    expect(resolveSchemaDefaults(schema)).toEqual({
      hasDefault: 'hello',
      enumOnly: 'a',
      nested: { inner: 'in' },
    });
  });

  it('applyDefaults prefers provided keys over defaults', () => {
    const value = applyDefaults(STAT_CARD_SCHEMA, { value: 99, unit: '%' });
    expect(value.value).toBe(99);
    expect(value.unit).toBe('%');
    expect(value.label).toBe('Metric');
  });
});

describe('inferControl', () => {
  it('maps string enum to segmented for ≤4 options', () => {
    const descriptor = inferControl('unit', { type: 'string', enum: ['none', 'k', 'M', '%'] });
    expect(descriptor.kind).toBe('segmented');
    expect(descriptor.options).toHaveLength(4);
  });

  it('maps long enums to select', () => {
    const descriptor = inferControl('font', {
      type: 'string',
      enum: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(descriptor.kind).toBe('select');
  });

  it('maps color format to color control', () => {
    expect(inferControl('accent', { type: 'string', format: 'color' }).kind).toBe('color');
  });

  it('honors the x-domio-prop.control override', () => {
    const descriptor = inferControl('boost', {
      type: 'number',
      minimum: 0,
      maximum: 10,
      'x-domio-prop': { control: 'slider' },
    });
    expect(descriptor.kind).toBe('slider');
    expect(descriptor.max).toBe(10);
  });

  it('groups descriptors by category in canonical order', () => {
    const groups = controlDescriptors(STAT_CARD_SCHEMA);
    expect(groups.map((g) => g.category)).toEqual(['Content', 'Style', 'Behavior']);
    expect(groups[0].controls.map((c) => c.keys[0])).toEqual(['value', 'label', 'unit']);
  });
});
