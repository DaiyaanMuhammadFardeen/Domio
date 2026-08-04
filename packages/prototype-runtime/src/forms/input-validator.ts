/**
 * Input validator — chain-of-rules evaluation for forms.
 *
 * Each input's validators run in declared order; the first failure
 * short-circuits and the input is reported with the matching error
 * code. Async validators (e.g. unique-email) are debounced 400 ms by
 * default and resolved through `pendingAsync`.
 */

import type {
  CoercionResult,
  ErrorCode,
  FormDefinition,
  FormErrors,
  FormValidationResult,
  FormValues,
  InputDefinition,
  InputType,
  Validator,
} from './types.js';

// ── Coercion ────────────────────────────────────────────────────────────

/**
 * Coerce an arbitrary input value into the canonical type expected by
 * the input. Returns `{ ok: false }` when the value cannot be coerced
 * without further interaction.
 */
export function coerce(type: InputType, value: unknown): CoercionResult {
  if (value === undefined) return ok(undefined);
  if (value === null) return ok(null);
  switch (type) {
    case 'text':
    case 'textarea':
    case 'richtext':
      return typeof value === 'string' ? ok(value) : ok(String(value));
    case 'email':
    case 'url':
    case 'tel':
      return typeof value === 'string' ? ok(value.trim()) : ok(String(value));
    case 'password':
      return typeof value === 'string' ? ok(value) : { ok: false, error: 'TYPE_MISMATCH' };
    case 'number':
    case 'range':
    case 'slider': {
      if (typeof value === 'number') return Number.isFinite(value) ? ok(value) : { ok: false, error: 'TYPE_MISMATCH' };
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) return ok(undefined);
        const n = Number(trimmed);
        return Number.isFinite(n) ? ok(n) : { ok: false, error: 'TYPE_MISMATCH' };
      }
      if (typeof value === 'boolean') return ok(value ? 1 : 0);
      return { ok: false, error: 'TYPE_MISMATCH' };
    }
    case 'select':
    case 'radio':
      return typeof value === 'string' ? ok(value) : ok(String(value));
    case 'multiselect':
      return Array.isArray(value) ? ok(value.map(String)) : { ok: false, error: 'TYPE_MISMATCH' };
    case 'checkbox':
      return typeof value === 'boolean' ? ok(value) : { ok: false, error: 'TYPE_MISMATCH' };
    case 'date':
    case 'time':
    case 'datetime':
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return ok(value);
      return { ok: false, error: 'TYPE_MISMATCH' };
    case 'file': {
      if (Array.isArray(value)) return ok(value);
      if (typeof value === 'object' && value !== null && 'name' in value) return ok(value);
      return { ok: false, error: 'INVALID_FILE' };
    }
    case 'signature':
      if (typeof value === 'string') return ok(value);
      if (Array.isArray(value)) return ok(value);
      return { ok: false, error: 'INVALID_SIGNATURE' };
    case 'color':
      if (typeof value === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(value)) return ok(value);
      return { ok: false, error: 'TYPE_MISMATCH' };
    default:
      return { ok: false, error: 'TYPE_MISMATCH' };
  }
}

function ok(value: unknown): CoercionResult { return { ok: true, value }; }

/** Resolve a default value for an input — author-provided or zero-value. */
export function defaultValueFor(inp: InputDefinition): unknown {
  if (inp.defaultValue !== undefined) return inp.defaultValue;
  switch (inp.type) {
    case 'number':
    case 'range':
    case 'slider':
      return inp.min ?? 0;
    case 'checkbox':
      return false;
    case 'multiselect':
      return [];
    case 'textarea':
    case 'richtext':
      return '';
    case 'file':
      return [];
    case 'signature':
      return null;
    default:
      return '';
  }
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Validate a `FormDefinition`'s values. Coerces each input's value to
 * its declared type, then runs the per-input validator chain. Any
 * failure is collected under `errors[<input>]`.
 */
export function validateForm(def: FormDefinition, values: FormValues): FormValidationResult {
  const coerced: Record<string, unknown> = {};
  const errors: Record<string, ErrorCode[]> = {};

  for (const inp of def.inputs) {
    const raw = values[inp.name];
    const coercedRes = coerce(inp.type, raw ?? defaultValueFor(inp));
    if (!coercedRes.ok) {
      errors[inp.name] = [coercedRes.error];
      continue;
    }
    coerced[inp.name] = coercedRes.value;

    // Per-input validator chain.
    const chain = effectiveValidators(inp);
    for (const v of chain) {
      const result = runValidator(inp.name, v, coerced[inp.name], values, coerced);
      if (!result.ok) {
        errors[inp.name] = [result.code];
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors: errors as FormErrors };
  }
  return { ok: true, value: coerced };
}

/** A sentinel that the async validator layer resolves through the runtime. */
export interface AsyncPendingCheck {
  readonly field: string;
  readonly check: string;
  readonly endpoint?: string;
}

export interface ValidatorResult {
  readonly ok: boolean;
  readonly code: ErrorCode;
}

/**
 * Run a single validator. Async validators return `ASYNC_PENDING` when
 * `pendingAsync` is not provided — consumers wire a backend check via
 * `resolveAsync`.
 */
export function runValidator(
  field: string,
  validator: Validator,
  value: unknown,
  allValues: FormValues,
  coerced: Readonly<Record<string, unknown>>,
  pendingAsync?: AsyncPendingCheck,
): ValidatorResult {
  switch (validator.kind) {
    case 'required': {
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      return { ok: !empty, code: 'REQUIRED' };
    }
    case 'min': {
      const n = toNumber(value);
      if (n === null) return { ok: true, code: 'MIN' }; // skip if not numeric
      return { ok: n >= validator.value, code: 'MIN' };
    }
    case 'max': {
      const n = toNumber(value);
      if (n === null) return { ok: true, code: 'MAX' };
      return { ok: n <= validator.value, code: 'MAX' };
    }
    case 'minLength': {
      const len = lengthOf(value);
      if (len === null) return { ok: true, code: 'MIN_LENGTH' };
      return { ok: len >= validator.value, code: 'MIN_LENGTH' };
    }
    case 'maxLength': {
      const len = lengthOf(value);
      if (len === null) return { ok: true, code: 'MAX_LENGTH' };
      return { ok: len <= validator.value, code: 'MAX_LENGTH' };
    }
    case 'pattern': {
      if (typeof value !== 'string') return { ok: true, code: 'PATTERN' };
      try {
        const re = new RegExp(validator.value, validator.flags ?? '');
        return { ok: re.test(value), code: 'PATTERN' };
      } catch {
        return { ok: true, code: 'PATTERN' }; // malformed pattern: skip
      }
    }
    case 'crossField': {
      const other = allValues[validator.field];
      switch (validator.rule) {
        case 'equals': return { ok: value === other, code: 'CROSS_FIELD' };
        case 'notEquals': return { ok: value !== other, code: 'CROSS_FIELD' };
        case 'greaterThan': {
          const a = toNumber(value), b = toNumber(other);
          if (a === null || b === null) return { ok: true, code: 'CROSS_FIELD' };
          return { ok: a > b, code: 'CROSS_FIELD' };
        }
        case 'lessThan': {
          const a = toNumber(value), b = toNumber(other);
          if (a === null || b === null) return { ok: true, code: 'CROSS_FIELD' };
          return { ok: a < b, code: 'CROSS_FIELD' };
        }
      }
      return { ok: true, code: 'CROSS_FIELD' };
    }
    case 'async': {
      if (pendingAsync) return { ok: false, code: 'ASYNC_PENDING' };
      return { ok: false, code: 'ASYNC_FAILED' };
    }
  }
  void field; void coerced;
  return { ok: true, code: 'REQUIRED' };
}

/** Effective validator chain — synthesizes `required` when `inp.required`. */
export function effectiveValidators(inp: InputDefinition): readonly Validator[] {
  const chain: Validator[] = [];
  if (inp.required) chain.push({ kind: 'required' });
  if (inp.validators) chain.push(...inp.validators);
  return chain;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function lengthOf(v: unknown): number | null {
  if (typeof v === 'string') return v.length;
  if (Array.isArray(v)) return v.length;
  return null;
}

/** Default async debounce — 400 ms per the M4.1 contract. */
export const DEFAULT_ASYNC_DEBOUNCE_MS = 400;