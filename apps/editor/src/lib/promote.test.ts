/**
 * Tests for promote.ts — inference engine, buildComponentDef, and ops.
 */

import { describe, it, expect } from 'vitest';
import {
  inferPropsSchema,
  buildComponentDef,
  replaceWithComponentOp,
  detachFromComponentOp,
} from './promote';
import type { Element } from '@domio/schema/generated/scene-graph';

function makeTextElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'test-el-1' as Element['id'],
    type: 'text',
    semanticId: 's1',
    name: 'Text',
    parentId: null,
    text: {
      content: 'Hello',
      fontSize: 16,
      fontFamily: 'sans',
      color: '#E6EDF3',
      fontWeight: 400,
      lineHeight: 1.4,
      align: 'left',
    },
    transform: { x: 0, y: 0, w: 100, h: 50 },
    ...overrides,
  } as unknown as Element;
}

function makeComponentElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'test-comp-1' as Element['id'],
    type: 'component',
    semanticId: 's2',
    name: 'Component',
    parentId: null,
    component: {
      catalogId: 'domio.stat-card',
      variant: 'default',
      props: {},
    },
    transform: { x: 0, y: 0, w: 200, h: 100 },
    ...overrides,
  } as unknown as Element;
}

describe('inferPropsSchema', () => {
  it('returns empty schema for empty selection', () => {
    const schema = inferPropsSchema([]);
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it('infers string prop for text content', () => {
    const el = makeTextElement({
      text: {
        content: 'Hello World',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    expect(schema.properties).toHaveProperty('prop0');
    expect(schema.properties.prop0).toMatchObject({ type: 'string', default: 'Hello World' });
    expect(schema.required).toContain('prop0');
  });

  it('infers number prop for numeric content', () => {
    const el = makeTextElement({
      text: {
        content: '42',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    expect(schema.properties.prop0).toMatchObject({ type: 'number', default: 42 });
  });

  it('infers number prop for decimal content', () => {
    const el = makeTextElement({
      text: {
        content: '3.14',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    expect(schema.properties.prop0).toMatchObject({ type: 'number', default: 3.14 });
  });

  it('infers boolean prop for true/false content', () => {
    const el = makeTextElement({
      text: {
        content: 'true',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    expect(schema.properties.prop0).toMatchObject({ type: 'boolean', default: true });
  });

  it('infers boolean prop for false content', () => {
    const el = makeTextElement({
      text: {
        content: 'false',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    expect(schema.properties.prop0).toMatchObject({ type: 'boolean', default: false });
  });

  it('infers color prop from fill', () => {
    // Use an element without text content so only the color prop appears
    const el = {
      id: 'test-el-color' as any,
      type: 'rect',
      semanticId: 's-c',
      name: 'Rect',
      parentId: null,
      fill: { type: 'solid', color: { r: 0.345, g: 0.651, b: 1, a: 1 } },
      transform: { x: 0, y: 0, w: 100, h: 50 },
    } as unknown as Element;
    const schema = inferPropsSchema([el]);
    expect(schema.properties.prop0).toMatchObject({
      type: 'string',
      format: 'color',
      default: '#58a6ff',
    });
  });

  it('handles mixed selection with text + color element', () => {
    const textEl = makeTextElement({
      text: {
        content: 'Revenue',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const colorEl = {
      id: 'test-el-2' as any,
      type: 'rect',
      semanticId: 's-c2',
      name: 'Box',
      parentId: null,
      fill: { type: 'solid', color: { r: 0.247, g: 0.725, b: 0.314, a: 1 } },
      transform: { x: 0, y: 0, w: 100, h: 50 },
    } as unknown as Element;
    const schema = inferPropsSchema([textEl, colorEl]);
    expect(Object.keys(schema.properties)).toHaveLength(2);
    expect(schema.properties.prop0).toMatchObject({ type: 'string', default: 'Revenue' });
    expect(schema.properties.prop1).toMatchObject({
      type: 'string',
      format: 'color',
      default: '#3fb950',
    });
  });
});

describe('buildComponentDef', () => {
  it('builds a component definition with correct metadata', () => {
    const el = makeTextElement();
    const schema = inferPropsSchema([el]);
    const def = buildComponentDef({
      name: 'Test Component',
      catalogId: 'my.test-component',
      elements: [el],
      schema,
    });

    expect(def.catalogId).toBe('my.test-component');
    expect(def.name).toBe('Test Component');
    expect(def.category).toBe('layout');
    expect(def.propsSchema).toEqual(schema);
  });

  it('build function produces elements with mapped props', () => {
    const el = makeTextElement({
      text: {
        content: 'placeholder',
        fontSize: 16,
        fontFamily: 'sans',
        color: '#E6EDF3',
        fontWeight: 400,
        lineHeight: 1.4,
        align: 'left',
      },
    } as any);
    const schema = inferPropsSchema([el]);
    const def = buildComponentDef({
      name: 'Test',
      catalogId: 'my.test',
      elements: [el],
      schema,
    });

    const result = def.build(
      { prop0: 'Revenue' },
      {
        variantId: 'default',
        id: () => 'new-id' as any,
        semanticId: (s: string) => s,
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new-id');
  });
});

describe('replaceWithComponentOp', () => {
  it('creates a forward/inverse op pair', () => {
    const removed = [makeTextElement({ id: 'rm1' } as any)];
    const added = [makeComponentElement({ id: 'add1' } as any)];
    const op = replaceWithComponentOp('slide-1' as any, removed, added);

    expect(op.name).toBe('AddElementOp');
    expect(op.forward.slideId).toBe('slide-1');
    expect(op.forward.removedIds).toEqual(['rm1']);
    expect(op.forward.addedIds).toEqual(['add1']);
    expect(op.inverse.removedIds).toEqual(['add1']);
    expect(op.inverse.addedIds).toEqual(['rm1']);
  });
});

describe('detachFromComponentOp', () => {
  it('creates a forward/inverse op pair', () => {
    const removed = [makeComponentElement({ id: 'comp1' } as any)];
    const added = [makeTextElement({ id: 'txt1' } as any)];
    const op = detachFromComponentOp('slide-1' as any, removed, added);

    expect(op.name).toBe('AddElementOp');
    expect(op.forward.removedId).toBe('comp1');
    expect(op.forward.addedIds).toEqual(['txt1']);
    expect(op.inverse.removedId).toBe('txt1');
    expect(op.inverse.addedIds).toEqual(['comp1']);
  });
});
