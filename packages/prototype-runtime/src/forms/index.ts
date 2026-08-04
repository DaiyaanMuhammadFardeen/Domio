/**
 * Forms module — public surface (Phase 10 M4.1).
 */

export * from './types.js';
export { FormRegistry } from './form-registry.js';
export {
  coerce,
  defaultValueFor,
  validateForm,
  runValidator,
  effectiveValidators,
  DEFAULT_ASYNC_DEBOUNCE_MS,
  type AsyncPendingCheck,
  type ValidatorResult,
} from './input-validator.js';
export {
  AutosavePolicy,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  type AutosavePolicyOptions,
  type DraftSaveCallback,
  type PersistedDraft,
} from './autosave-policy.js';
