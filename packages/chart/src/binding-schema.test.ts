import { describe, it, expect } from 'vitest';
import type { BindingSchema, Dataset, ColumnType } from './types.js';
import { validateBinding, bindingCompatible, requiredBindings } from './binding-schema.js';

function makeDataset(columns: Array<{ name: string; type: ColumnType }>, rows: Record<string, unknown>[] = [{ a: 1, b: 'x' }]): Dataset {
  return { columns, rows };
}

describe('binding schema validation', () => {
  describe('bar chart', () => {
    const schema: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'label' }, { role: 'y', column: 'value' }] };
    const dataset = makeDataset([
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
    ]);

    it('validates required keys for bar', () => {
      expect(bindingCompatible(schema, dataset)).toBe(true);
    });

    it('rejects missing column', () => {
      const bad: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'missing' }, { role: 'y', column: 'value' }] };
      const errors = validateBinding(bad, dataset);
      expect(errors.some((e) => e.kind === 'missing_column')).toBe(true);
    });

    it('rejects type mismatch', () => {
      const bad: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'label' }, { role: 'y', column: 'label' }] };
      const errors = validateBinding(bad, dataset);
      expect(errors.some((e) => e.kind === 'type_mismatch')).toBe(true);
    });
  });

  describe('line chart', () => {
    const schema: BindingSchema = { type: 'line', columns: [{ role: 'x', column: 't' }, { role: 'y', column: 'v' }] };
    const dataset = makeDataset([{ name: 't', type: 'string' }, { name: 'v', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('area chart', () => {
    const schema: BindingSchema = { type: 'area', columns: [{ role: 'x', column: 't' }, { role: 'y', column: 'v' }] };
    const dataset = makeDataset([{ name: 't', type: 'string' }, { name: 'v', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('pie chart', () => {
    const schema: BindingSchema = { type: 'pie', columns: [{ role: 'label', column: 'cat' }, { role: 'value', column: 'val' }] };
    const dataset = makeDataset([{ name: 'cat', type: 'string' }, { name: 'val', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('scatter chart', () => {
    const schema: BindingSchema = { type: 'scatter', columns: [{ role: 'x', column: 'xv' }, { role: 'y', column: 'yv' }] };
    const dataset = makeDataset([{ name: 'xv', type: 'number' }, { name: 'yv', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('funnel chart', () => {
    const schema: BindingSchema = { type: 'funnel', columns: [{ role: 'label', column: 'stage' }, { role: 'value', column: 'count' }] };
    const dataset = makeDataset([{ name: 'stage', type: 'string' }, { name: 'count', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('sankey chart', () => {
    const schema: BindingSchema = { type: 'sankey', columns: [{ role: 'x', column: 'src' }, { role: 'y', column: 'tgt' }, { role: 'value', column: 'flow' }] };
    const dataset = makeDataset([{ name: 'src', type: 'string' }, { name: 'tgt', type: 'string' }, { name: 'flow', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('treemap chart', () => {
    const schema: BindingSchema = { type: 'treemap', columns: [{ role: 'label', column: 'name' }, { role: 'value', column: 'size' }] };
    const dataset = makeDataset([{ name: 'name', type: 'string' }, { name: 'size', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('heatmap chart', () => {
    const schema: BindingSchema = { type: 'heatmap', columns: [{ role: 'x', column: 'col' }, { role: 'y', column: 'row' }, { role: 'value', column: 'v' }] };
    const dataset = makeDataset([{ name: 'col', type: 'string' }, { name: 'row', type: 'string' }, { name: 'v', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('waterfall chart', () => {
    const schema: BindingSchema = { type: 'waterfall', columns: [{ role: 'x', column: 'label' }, { role: 'y', column: 'delta' }] };
    const dataset = makeDataset([{ name: 'label', type: 'string' }, { name: 'delta', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('gauge chart', () => {
    const schema: BindingSchema = { type: 'gauge', columns: [{ role: 'value', column: 'pct' }] };
    const dataset = makeDataset([{ name: 'pct', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('radar chart', () => {
    const schema: BindingSchema = { type: 'radar', columns: [{ role: 'label', column: 'dim' }, { role: 'value', column: 'score' }] };
    const dataset = makeDataset([{ name: 'dim', type: 'string' }, { name: 'score', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('candlestick chart', () => {
    const schema: BindingSchema = { type: 'candlestick', columns: [{ role: 'x', column: 'date' }, { role: 'y', column: 'close' }] };
    const dataset = makeDataset([{ name: 'date', type: 'string' }, { name: 'close', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('bullet chart', () => {
    const schema: BindingSchema = { type: 'bullet', columns: [{ role: 'label', column: 'item' }, { role: 'value', column: 'actual' }] };
    const dataset = makeDataset([{ name: 'item', type: 'string' }, { name: 'actual', type: 'number' }]);

    it('validates', () => expect(bindingCompatible(schema, dataset)).toBe(true));
  });

  describe('requiredBindings', () => {
    it('returns roles for every chart type', () => {
      const types = ['bar', 'line', 'area', 'pie', 'scatter', 'funnel', 'sankey', 'treemap', 'heatmap', 'waterfall', 'gauge', 'radar', 'candlestick', 'bullet'] as const;
      for (const t of types) {
        const reqs = requiredBindings(t);
        expect(reqs.length).toBeGreaterThan(0);
      }
    });
  });
});
