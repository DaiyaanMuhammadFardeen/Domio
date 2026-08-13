/**
 * ElementSvg — recursive scene-graph → SVG renderer used by the canvas
 * preview. Handles every element kind including `component` layers, which
 * expand through the @domio/components pack into their scene-graph
 * children (already absolutely positioned by expandComponent).
 */

import { memo, type ReactElement } from 'react';
import type { Element } from '@domio/schema';
import { expandComponent } from '@domio/components';

interface Props {
  element: Element;
}

function rgbaToCss(rgba: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${Math.round(rgba.r)}, ${Math.round(rgba.g)}, ${Math.round(rgba.b)}, ${rgba.a})`;
}

function styleValue(el: Element, key: string): unknown {
  const style = el.style as Record<string, unknown> | undefined;
  return style?.[key];
}

function textFill(el: Element & { type: 'text' }): string {
  const fill = (el.style as Record<string, unknown> | undefined)?.fill as
    | { color?: { colorSpace?: string; value?: string } }
    | undefined;
  if (fill?.color?.value) return fill.color.value;
  return 'var(--text)';
}

function renderText(el: Element & { type: 'text' }): ReactElement | null {
  const t = el.transform;
  if (!t) return null;
  const fontSize = (styleValue(el, 'fontSize') as number | undefined) ?? 24;
  const fontWeight = (styleValue(el, 'fontWeight') as number | undefined) ?? 400;
  const fontFamily = (styleValue(el, 'fontFamily') as string | undefined) ?? 'Inter';
  const align = (styleValue(el, 'textAlign') as string | undefined) ?? 'start';
  const verticalCenter = (styleValue(el, 'verticalAlign') as string | undefined) === 'middle';
  const letterSpacing = styleValue(el, 'letterSpacing') as number | undefined;
  return (
    <text
      x={t.x}
      y={verticalCenter ? t.y + t.h / 2 : t.y}
      width={t.w}
      height={t.h}
      fill={textFill(el)}
      fontSize={fontSize}
      fontWeight={fontWeight}
      fontFamily={fontFamily}
      textAnchor={align === 'middle' ? 'middle' : align === 'end' ? 'end' : 'start'}
      dominantBaseline={verticalCenter ? 'central' : 'hanging'}
      {...(letterSpacing !== undefined ? { letterSpacing } : {})}
    >
      {el.text.content}
    </text>
  );
}

function renderFrame(el: Element & { type: 'frame' | 'autoLayout' }): ReactElement | null {
  const t = el.transform;
  if (!t) return null;
  const radius = (el.style as Record<string, unknown> | undefined)?.borderRadius as
    | number
    | undefined;
  const fill = el.fill?.color ? rgbaToCss(el.fill.color) : undefined;
  const strokeColor = el.stroke?.color ? rgbaToCss(el.stroke.color) : undefined;
  return (
    <rect
      x={t.x}
      y={t.y}
      width={t.w}
      height={t.h}
      fill={fill ?? 'none'}
      stroke={strokeColor}
      strokeWidth={el.stroke?.width ?? (fill ? 0 : 1)}
      {...(radius !== undefined ? { rx: radius } : {})}
    />
  );
}

function renderVector(el: Element & { type: 'vector' }): ReactElement {
  const d = el.paths.join(' ');
  const fill = el.fill?.color ? rgbaToCss(el.fill.color) : 'none';
  const strokeColor = el.stroke?.color ? rgbaToCss(el.stroke.color) : undefined;
  const strokeWidth = el.stroke?.width ?? 1;
  const dash = (el.style as Record<string, unknown> | undefined)?.strokeDasharray as
    | string
    | undefined;
  return (
    <path
      d={d}
      fill={fill}
      stroke={strokeColor}
      strokeWidth={strokeColor ? strokeWidth : 0}
      {...(dash ? { strokeDasharray: dash } : {})}
    />
  );
}

function renderImage(el: Element & { type: 'image' }): ReactElement | null {
  const t = el.transform;
  if (!t) return null;
  return (
    <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="var(--accent)" opacity={0.35} rx={6}>
      <title>{el.alt ?? el.assetId}</title>
    </rect>
  );
}

function renderComponent(el: Element & { type: 'component' }): ReactElement {
  const expanded = expandComponent(el);
  return (
    <g>
      {expanded.map((child) => (
        <ElementSvg key={child.id} element={child} />
      ))}
    </g>
  );
}

function renderPlaceholder(el: Element): ReactElement | null {
  const t = el.transform;
  if (!t) return null;
  return <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="var(--accent)" opacity={0.5} />;
}

/**
 * Renders a single element in absolute coordinates. Recurses into
 * component layers (via the pack) and group children (via parentId).
 */
export function ElementSvgInner({ element }: Props): ReactElement | null {
  switch (element.type) {
    case 'frame':
    case 'autoLayout':
      return renderFrame(element);
    case 'text':
      return renderText(element);
    case 'vector':
      return renderVector(element);
    case 'image':
      return renderImage(element);
    case 'component':
      return renderComponent(element);
    default:
      return renderPlaceholder(element);
  }
}

export const ElementSvg = memo(ElementSvgInner);
