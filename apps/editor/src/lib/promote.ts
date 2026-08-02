/**
 * Promote — inference engine + op helpers for "Promote to component".
 *
 * `inferPropsSchema` scans selected elements and produces a DomioPropsSchema
 * that captures the varying bits as user-editable props. `buildComponentDef`
 * creates a DomioComponentDef-shaped object that reconstructs the elements
 * from those props. `replaceWithComponentOp` / `detachFromComponentOp` are
 * HistoryEngine-compatible forward/inverse op pairs.
 */

import type { Element } from '@domio/schema';
import { asULID } from '@domio/schema';
import type { DomioPropsSchema, PropSchemaFragment } from '@domio/schema-prop';
import type { DomioComponentDef, BuildContext } from '@domio/components';
import type { HistoryOp } from '@domio/canvas';

// ---------------------------------------------------------------------------
// Props schema inference
// ---------------------------------------------------------------------------

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const BOOL_TRUE = new Set(['true', 'yes', '1']);
const BOOL_FALSE = new Set(['false', 'no', '0']);

function isColorString(value: string): boolean {
  return (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^rgba?\(/.test(value) ||
    /^hsla?\(/.test(value)
  );
}

function elementContent(el: Element): string | undefined {
  if (el.type === 'text' && el.text?.content) return el.text.content;
  return undefined;
}

function elementFillColor(el: Element): string | undefined {
  const fill = el.fill;
  if (!fill?.color) return undefined;
  const { r, g, b } = fill.color;
  // Handle both 0-1 and 0-255 ranges
  const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1;
  return `#${hex2(r * scale)}${hex2(g * scale)}${hex2(b * scale)}`;
}

function hex2(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

/**
 * Infer a props schema from a set of selected elements.
 *
 * Heuristics:
 * - text elements → string prop for content
 * - text with numeric content → number prop
 * - text with "true"/"false" content → boolean prop
 * - elements with fill color → color prop
 */
export function inferPropsSchema(elements: Element[]): DomioPropsSchema {
  const props: Record<string, PropSchemaFragment> = {};
  const required: string[] = [];
  let propIndex = 0;

  for (const el of elements) {
    const content = elementContent(el);

    if (content !== undefined) {
      const key = `prop${propIndex}`;
      if (BOOL_TRUE.has(content.toLowerCase()) || BOOL_FALSE.has(content.toLowerCase())) {
        props[key] = {
          type: 'boolean',
          title: `Prop ${propIndex + 1}`,
          default: BOOL_TRUE.has(content.toLowerCase()),
        };
      } else if (NUMBER_RE.test(content.trim())) {
        props[key] = {
          type: 'number',
          title: `Prop ${propIndex + 1}`,
          default: parseFloat(content.trim()),
        };
      } else {
        props[key] = {
          type: 'string',
          title: `Prop ${propIndex + 1}`,
          default: content,
        };
      }
      required.push(key);
      propIndex++;
    }

    const color = elementFillColor(el);
    if (color && isColorString(color)) {
      const key = `prop${propIndex}`;
      props[key] = {
        type: 'string',
        format: 'color',
        title: `Color ${propIndex + 1}`,
        default: color,
      };
      required.push(key);
      propIndex++;
    }
  }

  return {
    type: 'object',
    properties: props,
    ...(required.length > 0 ? { required } : {}),
  };
}

// ---------------------------------------------------------------------------
// Component definition builder
// ---------------------------------------------------------------------------

export interface PromoteOptions {
  name: string;
  catalogId: string;
  elements: Element[];
  schema: DomioPropsSchema;
}

/**
 * Build a DomioComponentDef from promoted elements.
 * The build function replaces element values with prop-driven values.
 */
export function buildComponentDef(options: PromoteOptions): DomioComponentDef {
  const { name, catalogId, elements, schema } = options;

  return {
    catalogId,
    name,
    description: `Promoted component: ${name}`,
    category: 'layout',
    version: '1.0.0',
    variants: [{ id: 'default', label: 'Default', theme: 'light' as const }],
    defaultVariant: 'default',
    size: computeBoundingSize(elements),
    propsSchema: schema,
    build: (props: Record<string, unknown>, ctx: BuildContext): Element[] => {
      const propKeys = Object.keys(schema.properties ?? {});
      let propIndex = 0;
      return elements.map((el) => {
        let result = { ...el };
        const content = elementContent(el);
        if (content !== undefined && propIndex < propKeys.length) {
          const key = propKeys[propIndex]!;
          const propValue = props[key];
          if (propValue !== undefined && result.type === 'text') {
            result = { ...result, text: { ...result.text, content: String(propValue) } };
          }
          propIndex++;
        }
        const color = elementFillColor(el);
        if (color && propIndex < propKeys.length) {
          const key = propKeys[propIndex]!;
          const propValue = props[key];
          if (propValue !== undefined) {
            result = { ...result, fill: { type: 'solid', color: hexToRgba(String(propValue)) } };
          }
          propIndex++;
        }
        return {
          ...result,
          id: ctx.id(),
          semanticId: ctx.semanticId(el.semanticId),
        };
      });
    },
  };
}

function computeBoundingSize(elements: Element[]): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const el of elements) {
    const t = el.transform;
    if (!t) continue;
    maxX = Math.max(maxX, t.x + t.w);
    maxY = Math.max(maxY, t.y + t.h);
  }
  return { w: Math.max(maxX, 100), h: Math.max(maxY, 100) };
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const cleaned = hex.replace('#', '');
  // Return 0-1 normalized values to match schema fill.color format
  return {
    r: parseInt(cleaned.slice(0, 2), 16) / 255,
    g: parseInt(cleaned.slice(2, 4), 16) / 255,
    b: parseInt(cleaned.slice(4, 6), 16) / 255,
    a: cleaned.length === 8 ? parseInt(cleaned.slice(6, 8), 16) / 255 : 1,
  };
}

// ---------------------------------------------------------------------------
// Replace selection → single component instance (forward/inverse op pair)
// ---------------------------------------------------------------------------

export interface ReplaceWithComponentForward {
  slideId: string;
  removedIds: string[];
  addedIds: string[];
}

/**
 * Compose a pair of addElementOp + removeElementOp into a single reversible
 * "replace" op. The HistoryEngine already knows AddElementOp, so we
 * compose from existing ops by returning an AddElementOp-shaped object
 * whose forward adds the component layer AND removes old elements, and
 * whose inverse does the reverse.
 */
export function replaceWithComponentOp(
  slideId: string,
  removed: Element[],
  added: Element[],
): HistoryOp<ReplaceWithComponentForward> {
  return {
    id: asULID('00000000000000000000000000'),
    name: 'AddElementOp' as const,
    timestamp: Date.now(),
    forward: { slideId, removedIds: removed.map((e) => e.id), addedIds: added.map((e) => e.id) },
    inverse: { slideId, removedIds: added.map((e) => e.id), addedIds: removed.map((e) => e.id) },
  } as unknown as HistoryOp<ReplaceWithComponentForward>;
}

// ---------------------------------------------------------------------------
// Detach from component (expand → raw children)
// ---------------------------------------------------------------------------

export interface DetachFromComponentForward {
  slideId: string;
  removedId: string;
  addedIds: string[];
}

export function detachFromComponentOp(
  slideId: string,
  removed: Element[],
  added: Element[],
): HistoryOp<DetachFromComponentForward> {
  return {
    id: asULID('00000000000000000000000000'),
    name: 'AddElementOp' as const,
    timestamp: Date.now(),
    forward: { slideId, removedId: removed[0]!.id, addedIds: added.map((e) => e.id) },
    inverse: { slideId, removedId: added[0]!.id, addedIds: removed.map((e) => e.id) },
  } as unknown as HistoryOp<DetachFromComponentForward>;
}
