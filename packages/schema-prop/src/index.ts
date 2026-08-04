/**
 * @domio/schema-prop — JSON Schema prop engine for smart components.
 * See docs/development_phases/phase-06-components-and-templates.md (WS-COM-1 #3).
 */

export type {
  DomioPropsSchema,
  DomioPropExtension,
  PropSchemaFragment,
  PropType,
  PropValidateResult,
  PropValidationError,
} from './types.js';

export {
  validateProps,
  validateFragment,
  isPlainObject,
  describeType,
  type ValidateOptions,
} from './validate.js';

export {
  resolveFragmentDefault,
  resolveSchemaDefaults,
  applyDefaults,
} from './resolve.js';

export {
  inferControl,
  controlDescriptors,
  type PropControlDescriptor,
  type PropControlKind,
  type DataBindingControlDescriptor,
  type ThresholdControlDescriptor,
  type TypedControlDescriptor,
} from './controls.js';

export {
  isColor,
  isColorWithAlpha,
  isFontFamily,
  isAssetRef,
  isDataBinding,
  isEnumFriendlyName,
  domioFormat,
  FORMAT_VALIDATORS,
  type DomioFormat,
} from './format.js';
