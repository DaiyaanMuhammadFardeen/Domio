/**
 * Control inference — maps a prop fragment to the control the PropsPanel
 * should render. Order of precedence: `x-domio-prop.control` override,
 * then format, then type heuristics.
 */

import type { DomioPropsSchema, DomioPropExtension, PropSchemaFragment } from './types.js';

export type PropControlKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'stepper'
  | 'slider'
  | 'toggle'
  | 'segmented'
  | 'select'
  | 'color'
  | 'color-with-alpha'
  | 'font'
  | 'asset'
  | 'data-binding'
  | 'repeatable'
  | 'nested-object'
  | 'union'
  | 'thresholds';

export interface PropControlDescriptor {
  kind: PropControlKind;
  /** Keys of the fragment this control edits. */
  keys: string[];
  /** Enum options for segmented/select controls. */
  options?: Array<{ label: string; value: unknown }> | undefined;
  /** Numeric bounds. */
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  unit?: string | undefined;
  placeholder?: string | undefined;
  livePreview?: boolean | undefined;
  category?: DomioPropExtension['category'] | undefined;
  /** Branch descriptors for union controls. */
  branches?: Array<{ label: string; schema: PropSchemaFragment }> | undefined;
}

/** Control descriptor for live-data binding panels (P08). */
export interface DataBindingControlDescriptor extends PropControlDescriptor {
  kind: 'data-binding';
  /** Human-readable label shown in the props panel. */
  label: string;
  /** Optional hint/description below the control. */
  hint?: string | undefined;
}

/** Control descriptor for threshold rule editors (P08). */
export interface ThresholdControlDescriptor extends PropControlDescriptor {
  kind: 'thresholds';
  /** Human-readable label shown in the props panel. */
  label: string;
  /** Maximum number of rules the component supports (feature #60 cap). */
  maxRules?: number | undefined;
}

/** Discriminated union of all typed control descriptors. */
export type TypedControlDescriptor =
  | PropControlDescriptor
  | DataBindingControlDescriptor
  | ThresholdControlDescriptor;

const OPTION_LABEL_PATTERN = /[A-Za-z0-9 _-]+/;

function friendlyOptionLabel(value: unknown): string {
  if (typeof value === 'string') {
    const out = value.replace(/[-_]/g, ' ').trim();
    return out.length > 0 && OPTION_LABEL_PATTERN.test(out) ? out : value;
  }
  return String(value);
}

/** Infers the control for a single prop fragment (used by the props panel). */
export function inferControl(
  key: string,
  fragment: PropSchemaFragment,
  opts: { category?: DomioPropExtension['category'] } = {},
): TypedControlDescriptor {
  const ext = fragment['x-domio-prop'];
  const category = ext?.category ?? opts.category;
  const base = { keys: [key], category, livePreview: ext?.livePreview ?? true };

  if (ext?.control) {
    switch (ext.control) {
      case 'text':
        return { ...base, kind: 'text', placeholder: ext.placeholder };
      case 'textarea':
        return { ...base, kind: 'textarea', placeholder: ext.placeholder };
      case 'number':
        return {
          ...base,
          kind: 'number',
          min: fragment.minimum,
          max: fragment.maximum,
          step: ext.step,
        };
      case 'stepper':
        return {
          ...base,
          kind: 'stepper',
          min: fragment.minimum,
          max: fragment.maximum,
          step: ext.step ?? 1,
          unit: ext.unit,
        };
      case 'slider':
        return {
          ...base,
          kind: 'slider',
          min: fragment.minimum ?? 0,
          max: fragment.maximum ?? 100,
          step: ext.step ?? 1,
          unit: ext.unit,
        };
      case 'toggle':
        return { ...base, kind: 'toggle' };
      case 'segmented':
        return {
          ...base,
          kind: 'segmented',
          options: (fragment.enum ?? []).map((v) => ({ label: friendlyOptionLabel(v), value: v })),
        };
      case 'select':
        return {
          ...base,
          kind: 'select',
          options: (fragment.enum ?? []).map((v) => ({ label: friendlyOptionLabel(v), value: v })),
        };
      case 'color':
        return { ...base, kind: 'color' };
      case 'color-with-alpha':
        return { ...base, kind: 'color-with-alpha' };
      case 'font':
        return { ...base, kind: 'font' };
      case 'asset':
        return { ...base, kind: 'asset' };
      case 'data-binding':
        return { ...base, kind: 'data-binding', label: 'Bind to data (P08)' };
      case 'repeatable':
        return { ...base, kind: 'repeatable' };
      case 'thresholds':
        return { ...base, kind: 'thresholds', label: 'Threshold rules', maxRules: 64 };
    }
  }

  // Union branch.
  if (fragment.oneOf || fragment.anyOf) {
    const branches = (fragment.oneOf ?? fragment.anyOf) as PropSchemaFragment[];
    return {
      ...base,
      kind: 'union',
      branches: branches.map((branch) => ({
        label: branch.title ?? friendlyOptionLabel(firstEnum(branch)) ?? 'Branch',
        schema: branch,
      })),
    };
  }

  // Format-driven.
  switch (fragment.format) {
    case 'color':
      return { ...base, kind: 'color' };
    case 'color-with-alpha':
      return { ...base, kind: 'color-with-alpha' };
    case 'font-family':
      return { ...base, kind: 'font' };
    case 'asset-ref':
      return { ...base, kind: 'asset' };
    case 'data-binding':
      return { ...base, kind: 'data-binding', label: 'Bind to data (P08)' };
  }

  // Enum → segmented (≤ 4) or select.
  if (fragment.enum && fragment.enum.length > 0) {
    const options = fragment.enum.map((v) => ({ label: friendlyOptionLabel(v), value: v }));
    return { ...base, kind: fragment.enum.length <= 4 ? 'segmented' : 'select', options };
  }

  // Type-driven.
  const type = Array.isArray(fragment.type) ? fragment.type[0] : fragment.type;
  switch (type) {
    case 'string':
      if (fragment.maxLength !== undefined && fragment.maxLength > 80) {
        return { ...base, kind: 'textarea', placeholder: ext?.placeholder };
      }
      return { ...base, kind: 'text', placeholder: ext?.placeholder };
    case 'integer':
    case 'number':
      return {
        ...base,
        kind: 'stepper',
        min: fragment.minimum,
        max: fragment.maximum,
        step: ext?.step ?? (type === 'integer' ? 1 : 0.1),
        unit: ext?.unit,
      };
    case 'boolean':
      return { ...base, kind: 'toggle' };
    case 'array':
      return { ...base, kind: 'repeatable' };
    case 'object':
      return { ...base, kind: 'nested-object' };
    default:
      return { ...base, kind: 'text' };
  }
}

function firstEnum(fragment: PropSchemaFragment): unknown {
  return fragment.enum?.[0];
}

/** Ordered, category-grouped control descriptors for the whole schema. */
export function controlDescriptors(schema: DomioPropsSchema): Array<{
  category: NonNullable<DomioPropExtension['category']>;
  controls: TypedControlDescriptor[];
}> {
  const groups = new Map<NonNullable<DomioPropExtension['category']>, TypedControlDescriptor[]>();
  for (const [key, fragment] of Object.entries(schema.properties ?? {})) {
    const descriptor = inferControl(key, fragment);
    const category = descriptor.category ?? 'Content';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(descriptor);
  }
  const order: Array<NonNullable<DomioPropExtension['category']>> = [
    'Content',
    'Layout',
    'Style',
    'Behavior',
    'Advanced',
  ];
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([category, controls]) => ({ category, controls }));
}
