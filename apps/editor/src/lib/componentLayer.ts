/**
 * Scene-graph factory for inserting component instances.
 */

import { asULID, type ComponentLayer } from '@domio/schema';
import { getComponent, type DomioComponentDef } from '@domio/components';

export interface InsertTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute a centered placement for a component on the 1600×900 canvas.
 * The component's intrinsic aspect is preserved; width scales toward 60%
 * of the slide.
 */
export function placeComponent(def: DomioComponentDef): InsertTarget {
  const slideW = 1600;
  const slideH = 900;
  const targetW = Math.min(slideW * 0.6, Math.max(def.size.w * 1.5, 480));
  const targetH = targetW * (def.size.h / def.size.w);
  return {
    x: (slideW - targetW) / 2,
    y: (slideH - targetH) / 2,
    w: targetW,
    h: targetH,
  };
}

/**
 * Build a `component` layer element with default props resolved through the
 * pack's props schema. The variant is set to the component default.
 */
export function makeComponentLayer(
  def: DomioComponentDef,
  id = asULID('01HZX01HZX01HZX01HZX01HZ'),
): ComponentLayer {
  const target = placeComponent(def);
  return {
    id: asULID(id),
    semanticId: `${def.catalogId.split('.').pop()}-${Date.now().toString(36)}`,
    type: 'component',
    name: def.name,
    parentId: null,
    transform: { x: target.x, y: target.y, w: target.w, h: target.h, rotation: 0 },
    component: {
      catalogId: def.catalogId,
      version: def.version,
      variant: def.defaultVariant,
      props: def.propsSchema.required
        ? Object.fromEntries(
            def.propsSchema.required.map((key) => {
              const fragment = def.propsSchema.properties[key];
              return [key, fragment?.default ?? null];
            }),
          )
        : {},
    },
  };
}

export function getInsertableComponent(catalogId: string): DomioComponentDef | undefined {
  return getComponent(catalogId);
}
