/**
 * Component expansion — turns a `component` scene-graph layer into the
 * concrete scene-graph elements it represents, scaled into the layer's
 * transform box. Deterministic per instance (see id.ts).
 */

import type { ComponentLayer, Element } from '@domio/schema';
import { validateProps } from '@domio/schema-prop';
import { getComponent } from './catalog.js';
import { createIdFactory, seedFor } from './id.js';
import type { BuildContext } from './types.js';

/**
 * Expands a component layer into absolutely-positioned elements ready for
 * rendering. Returns `[]` when the catalogId is unknown (editor surfaces
 * show a placeholder for unresolved refs).
 */
export function expandComponent(layer: ComponentLayer): Element[] {
  const def = getComponent(layer.component.catalogId);
  if (!def) return [];

  const { value: props } = validateProps(def.propsSchema, layer.component.props, {
    coerce: true,
    fillDefaults: true,
  });
  const variantId = layer.component.variant ?? def.defaultVariant;
  const seed = seedFor(layer.id, variantId, props);
  const ctx: BuildContext = {
    variantId,
    id: createIdFactory(seed),
    semanticId: (role) => `${layer.semanticId}.${role}`,
  };

  const local = def.build(props, ctx);
  const t = layer.transform;
  if (!t) return local;

  const sx = def.size.w > 0 ? t.w / def.size.w : 1;
  const sy = def.size.h > 0 ? t.h / def.size.h : 1;
  return local.map((el) => {
    if (!el.transform) return el;
    return {
      ...el,
      transform: {
        ...el.transform,
        x: t.x + el.transform.x * sx,
        y: t.y + el.transform.y * sy,
        w: el.transform.w * sx,
        h: el.transform.h * sy,
        rotation: el.transform.rotation ?? 0,
      },
    };
  });
}

/** Resolves the effective variant for a layer (falls back to the default). */
export function resolveVariant(layer: ComponentLayer): string {
  const def = getComponent(layer.component.catalogId);
  return layer.component.variant ?? def?.defaultVariant ?? 'light';
}
