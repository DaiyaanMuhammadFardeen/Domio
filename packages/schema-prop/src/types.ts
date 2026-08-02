/**
 * Types for the Domio prop engine — a constrained subset of JSON Schema
 * draft 2020-12 (see docs/components-templates.md §4.2).
 */

/** Domio-specific extension block on a prop fragment. */
export interface DomioPropExtension {
  /** Grouping used by the props panel section headers. */
  category?: 'Content' | 'Layout' | 'Style' | 'Behavior' | 'Advanced';
  /** Control override — forces a control even when the type is ambiguous. */
  control?:
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
    | 'repeatable';
  /** Whether the canvas should re-render on every keystroke. */
  livePreview?: boolean;
  /** Step for stepper/slider controls. */
  step?: number;
  /** Unit suffix for numeric controls. */
  unit?: string;
  /** Placeholder for text controls. */
  placeholder?: string;
}

export type PropType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

/** One JSON Schema fragment for a single prop. */
export interface PropSchemaFragment {
  type?: PropType | PropType[];
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  /** Domio format extensions: color, color-with-alpha, font-family,
   *  asset-ref, data-binding, enum-friendly-name. */
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: PropSchemaFragment;
  prefixItems?: PropSchemaFragment[];
  properties?: Record<string, PropSchemaFragment>;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: PropSchemaFragment[];
  anyOf?: PropSchemaFragment[];
  'x-domio-prop'?: DomioPropExtension;
  [key: string]: unknown;
}

/** Top-level props schema — always an object type. */
export interface DomioPropsSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type: 'object';
  required?: string[];
  properties: Record<string, PropSchemaFragment>;
  additionalProperties?: boolean;
}

export interface PropValidationError {
  /** Dot path into the props value, e.g. `trend` or `dataBinding.source`. */
  path: string;
  /** Stable machine code (see docs/components-templates.md §6 for mapping). */
  code:
    | 'required'
    | 'type'
    | 'enum'
    | 'min_length'
    | 'max_length'
    | 'min'
    | 'max'
    | 'min_items'
    | 'max_items'
    | 'pattern'
    | 'format'
    | 'additional_properties'
    | 'one_of'
    | 'any_of'
    | 'invalid_argument';
  message: string;
}

export interface PropValidateResult {
  valid: boolean;
  errors: PropValidationError[];
  /** The value with defaults applied; when `coerce` is enabled, loose
   *  string→number/boolean conversions are applied for matching props. */
  value: Record<string, unknown>;
}
