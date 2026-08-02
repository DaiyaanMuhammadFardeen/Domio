/**
 * ComponentThumb — renders a component's default-prop expansion as SVG,
 * used for Insert panel previews.
 */

'use client';

import { memo } from 'react';
import type { ReactElement } from 'react';
import { asULID, type ComponentLayer } from '@domio/schema';
import { expandComponent, type DomioComponentDef } from '@domio/components';
import { ElementSvg } from './ElementSvg';

function ComponentThumbInner({ def }: { def: DomioComponentDef }): ReactElement {
  const layer: ComponentLayer = {
    id: asULID('01HZX01HZX01HZX01HZX01HZ'),
    semanticId: 'thumb',
    type: 'component',
    name: def.name,
    parentId: null,
    transform: { x: 0, y: 0, w: def.size.w, h: def.size.h, rotation: 0 },
    component: {
      catalogId: def.catalogId,
      version: def.version,
      variant: def.defaultVariant,
      props: {},
    },
  };
  const children = expandComponent(layer);
  return (
    <svg
      viewBox={`0 0 ${def.size.w} ${def.size.h}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {children.map((el) => (
        <ElementSvg key={el.id} element={el} />
      ))}
    </svg>
  );
}

export const ComponentThumb = memo(ComponentThumbInner);
