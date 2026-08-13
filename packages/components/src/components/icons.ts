/**
 * domio.icon — a generic SVG icon component.
 * Renders a named icon path at a given size and color.
 */

import type { Element } from '@domio/schema';
import type { BuildContext, DomioComponentDef } from '../types.js';
import { rect, text, asString, asNumber } from '../helpers.js';

const LIGHT_DARK = [
  { id: 'light', label: 'Light', theme: 'light' as const },
  { id: 'dark', label: 'Dark', theme: 'dark' as const },
];

export const ICON: DomioComponentDef = {
  catalogId: 'domio.icon',
  name: 'Icon',
  description: 'A generic SVG icon rendered from path data at a given size and color.',
  category: 'layout',
  version: '1.0.0',
  variants: LIGHT_DARK,
  defaultVariant: 'light',
  size: { w: 48, h: 48 },
  propsSchema: {
    $id: 'domio.icon/props/1.0.0',
    type: 'object',
    required: ['iconId'],
    additionalProperties: false,
    properties: {
      iconId: {
        type: 'string',
        title: 'Icon ID',
        default: 'star',
        description: 'The icon identifier from the icon registry.',
        'x-domio-prop': { category: 'Content', control: 'text' },
      },
      color: {
        type: 'string',
        format: 'color',
        title: 'Color',
        default: '#E6EDF3',
        'x-domio-prop': { category: 'Style', control: 'color' },
      },
      size: {
        type: 'number',
        title: 'Size',
        default: 48,
        minimum: 8,
        maximum: 256,
        'x-domio-prop': { category: 'Layout', control: 'slider', step: 4, unit: 'px' },
      },
      label: {
        type: 'string',
        title: 'Label',
        default: '',
        'x-domio-prop': {
          category: 'Content',
          control: 'text',
          placeholder: 'Optional label below icon',
        },
      },
    },
  },
  build: (props: Record<string, unknown>, ctx: BuildContext): Element[] => {
    const iconId = asString(props.iconId, 'star');
    const color = asString(props.color, '#E6EDF3');
    const size = asNumber(props.size, 48);
    const label = asString(props.label, '');

    const W = size;
    const H = label ? size + 20 : size;
    const elements: Element[] = [];

    // Background hit area
    elements.push(
      rect(ctx, {
        x: 0,
        y: 0,
        w: W,
        h: H,
        fill: 'transparent',
        semanticId: 'hit-area',
      }),
    );

    // Placeholder rect representing the icon shape
    const padding = size * 0.15;
    elements.push(
      rect(ctx, {
        x: padding,
        y: padding,
        w: size - padding * 2,
        h: size - padding * 2,
        fill: color,
        radius: size * 0.1,
        opacity: 0.2,
        semanticId: 'icon-bg',
      }),
    );

    // Icon identifier text in the center
    elements.push(
      text(ctx, {
        x: 0,
        y: padding,
        w: W,
        h: size - padding * 2,
        content: iconId,
        fontSize: Math.max(10, size * 0.2),
        color,
        align: 'middle',
        verticalCenter: true,
        fontWeight: 600,
        semanticId: 'icon-label',
      }),
    );

    // Optional text label below
    if (label) {
      elements.push(
        text(ctx, {
          x: 0,
          y: size + 2,
          w: W,
          h: 16,
          content: label,
          fontSize: 11,
          color: '#94A3B8',
          align: 'middle',
          verticalCenter: false,
          fontWeight: 400,
          semanticId: 'label',
        }),
      );
    }

    return elements;
  },
};
