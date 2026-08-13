import { describe, it, expect } from 'vitest';
import {
  inferControl,
  type DataBindingControlDescriptor,
  type ThresholdControlDescriptor,
} from './controls.js';
import { validateProps } from './validate.js';
import type { DomioPropsSchema, PropSchemaFragment } from './types.js';

// -------------------------------------------------------------------
// data-binding control kind
// -------------------------------------------------------------------
describe('inferControl — data-binding', () => {
  it('emits {kind:"data-binding"} for x-domio-prop control marker', () => {
    const fragment: PropSchemaFragment = {
      type: 'object',
      'x-domio-prop': { control: 'data-binding', category: 'Behavior' },
    };
    const desc = inferControl('binding', fragment) as DataBindingControlDescriptor;
    expect(desc.kind).toBe('data-binding');
    expect(desc.keys).toEqual(['binding']);
    expect(desc.label).toBe('Bind to data (P08)');
  });

  it('emits {kind:"data-binding"} for format marker', () => {
    const fragment: PropSchemaFragment = {
      type: 'string',
      format: 'data-binding',
    };
    const desc = inferControl('dataSrc', fragment) as DataBindingControlDescriptor;
    expect(desc.kind).toBe('data-binding');
    expect(desc.label).toBe('Bind to data (P08)');
  });
});

// -------------------------------------------------------------------
// thresholds control kind
// -------------------------------------------------------------------
describe('inferControl — thresholds', () => {
  it('emits {kind:"thresholds"} for x-domio-prop control marker', () => {
    const fragment: PropSchemaFragment = {
      type: 'array',
      'x-domio-prop': { control: 'thresholds', category: 'Advanced' },
    };
    const desc = inferControl('rules', fragment) as ThresholdControlDescriptor;
    expect(desc.kind).toBe('thresholds');
    expect(desc.keys).toEqual(['rules']);
    expect(desc.label).toBe('Threshold rules');
    expect(desc.maxRules).toBe(64);
  });
});

// -------------------------------------------------------------------
// existing behaviour preserved
// -------------------------------------------------------------------
describe('inferControl — existing behaviour', () => {
  it('unknown marker falls through to type-driven heuristic', () => {
    const fragment: PropSchemaFragment = {
      type: 'string',
      title: 'Name',
    };
    const desc = inferControl('name', fragment);
    expect(desc.kind).toBe('text');
    expect(desc.keys).toEqual(['name']);
  });

  it('stepper control still works', () => {
    const fragment: PropSchemaFragment = {
      type: 'number',
      minimum: 0,
      maximum: 100,
      'x-domio-prop': { control: 'stepper', step: 5 },
    };
    const desc = inferControl('count', fragment);
    expect(desc.kind).toBe('stepper');
    expect(desc.min).toBe(0);
    expect(desc.max).toBe(100);
    expect(desc.step).toBe(5);
  });
});

// -------------------------------------------------------------------
// round-trip through prop validation
// -------------------------------------------------------------------
describe('data-binding and thresholds pass prop validation round-trip', () => {
  it('data-binding kind does not break validation', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        binding: {
          type: 'object',
          'x-domio-prop': { control: 'data-binding', category: 'Behavior' },
        },
      },
    };
    const value = { binding: { queryId: 'q1', fieldMap: {}, listenToFilters: [] } };
    const result = validateProps(schema, value);
    expect(result.valid).toBe(true);
    expect(result.value['binding']).toEqual(value.binding);
  });

  it('thresholds kind does not break validation', () => {
    const schema: DomioPropsSchema = {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          'x-domio-prop': { control: 'thresholds', category: 'Advanced' },
        },
      },
    };
    const value = {
      rules: [
        {
          id: 'r1',
          measure: 'cpu',
          comparator: 'gt',
          values: [90],
          severity: 'warn',
          styleOverride: {},
        },
      ],
    };
    const result = validateProps(schema, value);
    expect(result.valid).toBe(true);
    expect(result.value['rules']).toEqual(value.rules);
  });

  it('descriptor kinds are not treated as primitive text/number/color controls', () => {
    const bindingFrag: PropSchemaFragment = {
      type: 'object',
      'x-domio-prop': { control: 'data-binding' },
    };
    const thresholdFrag: PropSchemaFragment = {
      type: 'array',
      'x-domio-prop': { control: 'thresholds' },
    };
    const bindingDesc = inferControl('b', bindingFrag);
    const thresholdDesc = inferControl('t', thresholdFrag);
    expect(['text', 'number', 'color', 'stepper', 'slider', 'toggle']).not.toContain(
      bindingDesc.kind,
    );
    expect(['text', 'number', 'color', 'stepper', 'slider', 'toggle']).not.toContain(
      thresholdDesc.kind,
    );
  });
});
