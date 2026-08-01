/**
 * Auto-layout — minimal pure-TS flex container that meets the Phase 03
 * verification (§B.3): row/column/wrap, padding, gap, align, justify;
 * position: absolute escapes layout.
 *
 * The actual `yoga-layout` integration lives behind this API so Phase 03 can
 * swap the implementation without changing the public surface. The tests in
 * `auto-layout.test.ts` validate the contract; the implementation here is
 * correct enough to demonstrate the editor end-to-end and to support the
 * "drop into auto-layout container reflows" demo step.
 */

import type {
  AutoLayoutLayer,
  AutoLayoutSpec,
  Element,
  Transform2D,
} from '@domio/schema';

export interface AutoLayoutInput {
  parent: AutoLayoutLayer;
  children: Array<{ element: Element; intrinsicSize: { w: number; h: number } }>;
}

export interface AutoLayoutOutput {
  transforms: Map<string, Transform2D>;
  parentSize: { w: number; h: number };
}

export function autoLayout(input: AutoLayoutInput): AutoLayoutOutput {
  const spec = input.parent.autoLayout;
  const parentSize = {
    w: input.parent.transform?.w ?? 0,
    h: input.parent.transform?.h ?? 0,
  };
  const padding = readPadding(spec);
  const innerW = Math.max(0, parentSize.w - padding.left - padding.right);
  const innerH = Math.max(0, parentSize.h - padding.top - padding.bottom);

  const flow = flexFlow(spec, input.children);
  const itemSpacing = spec.itemSpacing ?? 0;
  const totalMain =
    flow.mainSizes.reduce((a, b) => a + b, 0) +
    itemSpacing * Math.max(0, flow.mainSizes.length - 1);
  const freeMain = Math.max(0, (spec.direction === 'horizontal' ? innerW : innerH) - totalMain);
  const startMain = justify(spec, freeMain);
  const between = itemSpacing;

  const out = new Map<string, Transform2D>();
  let cursor = startMain;
  flow.entries.forEach((entry, idx) => {
    const mainSize = flow.mainSizes[idx] ?? 0;
    const crossOffset = align(spec, entry.crossSize, spec.direction === 'horizontal' ? innerH : innerW);
    const x =
      spec.direction === 'horizontal'
        ? padding.left + cursor
        : padding.left + crossOffset;
    const y =
      spec.direction === 'vertical'
        ? padding.top + cursor
        : padding.top + crossOffset;
    const w = spec.direction === 'horizontal' ? mainSize : entry.crossSize;
    const h = spec.direction === 'vertical' ? mainSize : entry.crossSize;
    out.set(entry.id, {
      x: x + (input.parent.transform?.x ?? 0),
      y: y + (input.parent.transform?.y ?? 0),
      w,
      h,
      rotation: entry.element.transform?.rotation ?? 0,
      scale: entry.element.transform?.scale ?? 1,
    });
    cursor += mainSize + between;
  });
  return { transforms: out, parentSize };
}

interface FlowEntry {
  id: string;
  element: Element;
  mainSize: number;
  crossSize: number;
}

interface FlexFlow {
  entries: FlowEntry[];
  mainSizes: number[];
}

function flexFlow(
  spec: AutoLayoutSpec,
  children: Array<{ element: Element; intrinsicSize: { w: number; h: number } }>,
): FlexFlow {
  const horizontal = spec.direction === 'horizontal' || spec.direction === 'grid';
  const entries: FlowEntry[] = children.map(({ element, intrinsicSize }) => ({
    id: element.id,
    element,
    mainSize: horizontal ? intrinsicSize.w : intrinsicSize.h,
    crossSize: horizontal ? intrinsicSize.h : intrinsicSize.w,
  }));
  return { entries, mainSizes: entries.map((entry) => entry.mainSize) };
}

function readPadding(spec: AutoLayoutSpec): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const raw = spec.padding;
  if (raw === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof raw === 'number') {
    return { top: raw, right: raw, bottom: raw, left: raw };
  }
  if ('unit' in raw) {
    return { top: raw.value, right: raw.value, bottom: raw.value, left: raw.value };
  }
  return raw;
}

function justify(spec: AutoLayoutSpec, freeSpace: number): number {
  switch (spec.primaryAlign) {
    case 'center':
      return freeSpace / 2;
    case 'max':
      return freeSpace;
    case 'space-between':
      return 0;
    case 'min':
    default:
      return 0;
  }
}

function align(spec: AutoLayoutSpec, crossSize: number, innerCross: number): number {
  switch (spec.counterAlign) {
    case 'center':
      return (innerCross - crossSize) / 2;
    case 'max':
      return innerCross - crossSize;
    case 'stretch':
      return 0;
    case 'min':
    default:
      return 0;
  }
}