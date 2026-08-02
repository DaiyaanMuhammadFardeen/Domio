/**
 * Prop engine — validates a props value against a Domio props schema
 * (JSON Schema draft 2020-12 subset). Hand-rolled so it runs in well under
 * the 5 ms p99 budget (docs/components-templates.md §8.3) with no heavy
 * dependency in the editor hot path.
 */

import {
  domioFormat,
} from './format.js';
import type {
  DomioPropsSchema,
  PropSchemaFragment,
  PropValidateResult,
  PropValidationError,
} from './types.js';
import { resolveFragmentDefault } from './resolve.js';

export interface ValidateOptions {
  /** Loose string→number/boolean coercion for matching props. */
  coerce?: boolean;
  /** Fill defaults for missing props before validating. */
  fillDefaults?: boolean;
}

export function validateProps(
  schema: DomioPropsSchema,
  value: unknown,
  options: ValidateOptions = {},
): PropValidateResult {
  const errors: PropValidationError[] = [];
  const { coerce = false, fillDefaults = true } = options;

  if (!isPlainObject(value)) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          code: 'type',
          message: 'Props value must be an object.',
        },
      ],
      value: {},
    };
  }

  const props = schema.properties ?? {};
  const out: Record<string, unknown> = {};

  // 1. Fill defaults first so required/defaulted props are present.
  for (const [key, fragment] of Object.entries(props)) {
    const hasValue = Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
    if (hasValue) {
      out[key] = (value as Record<string, unknown>)[key];
    } else if (fillDefaults) {
      const dflt = resolveFragmentDefault(fragment);
      if (dflt !== undefined) out[key] = dflt;
    }
  }

  // 2. Validate each declared prop; keep the best-effort coerced value.
  for (const [key, fragment] of Object.entries(props)) {
    const hasValue = Object.prototype.hasOwnProperty.call(out, key) && out[key] !== undefined;
    if (!hasValue) {
      if (schema.required?.includes(key)) {
        errors.push({
          path: key,
          code: 'required',
          message: `Missing required prop "${key}".`,
        });
      }
      continue;
    }
    const current = out[key];
    const validated = validateFragment(fragment, current, key, coerce);
    if (validated.ok) {
      out[key] = validated.value;
    } else {
      errors.push(...validated.errors);
      out[key] = current;
    }
  }

  // 3. Reject undeclared props.
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) {
        errors.push({
          path: key,
          code: 'additional_properties',
          message: `Prop "${key}" is not allowed by the schema (additionalProperties: false).`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, value: out };
}

interface FragmentResult {
  ok: boolean;
  value: unknown;
  errors: PropValidationError[];
}

function ok(value: unknown): FragmentResult {
  return { ok: true, value, errors: [] };
}

function fail(path: string, code: PropValidationError['code'], message: string): FragmentResult {
  return { ok: false, value: undefined, errors: [{ path, code, message }] };
}

const TRUE_STRINGS = new Set(['true', 'yes', '1']);
const FALSE_STRINGS = new Set(['false', 'no', '0']);

export function validateFragment(
  fragment: PropSchemaFragment,
  value: unknown,
  path: string,
  coerce = false,
): FragmentResult {
  const types = fragment.type === undefined ? null : Array.isArray(fragment.type) ? fragment.type : [fragment.type];

  // --- type check (with optional coercion) ---
  if (types) {
    const passed = types.some((t) => matchesType(t, value));
    if (!passed) {
      if (coerce) {
        const coerced = coerceValue(types, value);
        if (coerced !== NO_COERCE) {
          value = coerced;
        } else {
          return fail(path, 'type', `Expected ${types.join(' or ')}, got ${describeType(value)}.`);
        }
      } else {
        return fail(path, 'type', `Expected ${types.join(' or ')}, got ${describeType(value)}.`);
      }
    }
  }

  // --- const / enum ---
  if (fragment.const !== undefined) {
    if (!deepEqual(value, fragment.const)) {
      return fail(path, 'enum', `Value must equal ${JSON.stringify(fragment.const)}.`);
    }
  }
  if (fragment.enum !== undefined) {
    const matched = fragment.enum.some((candidate) => deepEqual(value, candidate) || looseEqual(value, candidate));
    if (!matched) {
      return fail(path, 'enum', `Value must be one of ${fragment.enum.map((e) => JSON.stringify(e)).join(', ')}.`);
    }
  }

  // --- format ---
  const fmt = domioFormat(fragment.format);
  if (fmt && typeof value === 'string' && !isValidFormat(fmt, value)) {
    return fail(path, 'format', `Value does not match the "${fragment.format}" format.`);
  }

  // --- string constraints ---
  if (typeof value === 'string') {
    if (typeof fragment.minLength === 'number' && value.length < fragment.minLength) {
      return fail(path, 'min_length', `Must be at least ${fragment.minLength} characters.`);
    }
    if (typeof fragment.maxLength === 'number' && value.length > fragment.maxLength) {
      return fail(path, 'max_length', `Must be at most ${fragment.maxLength} characters.`);
    }
    if (typeof fragment.pattern === 'string' && !new RegExp(fragment.pattern).test(value)) {
      return fail(path, 'pattern', `Value does not match pattern ${fragment.pattern}.`);
    }
  }

  // --- numeric constraints ---
  if (typeof value === 'number') {
    if (typeof fragment.minimum === 'number' && value < fragment.minimum) {
      return fail(path, 'min', `Must be >= ${fragment.minimum}.`);
    }
    if (typeof fragment.maximum === 'number' && value > fragment.maximum) {
      return fail(path, 'max', `Must be <= ${fragment.maximum}.`);
    }
    if (typeof fragment.exclusiveMinimum === 'number' && value <= fragment.exclusiveMinimum) {
      return fail(path, 'min', `Must be > ${fragment.exclusiveMinimum}.`);
    }
    if (typeof fragment.exclusiveMaximum === 'number' && value >= fragment.exclusiveMaximum) {
      return fail(path, 'max', `Must be < ${fragment.exclusiveMaximum}.`);
    }
  }

  // --- array constraints ---
  if (Array.isArray(value)) {
    if (typeof fragment.minItems === 'number' && value.length < fragment.minItems) {
      return fail(path, 'min_items', `Must contain at least ${fragment.minItems} items.`);
    }
    if (typeof fragment.maxItems === 'number' && value.length > fragment.maxItems) {
      return fail(path, 'max_items', `Must contain at most ${fragment.maxItems} items.`);
    }
    const itemErrors: PropValidationError[] = [];
    let anyFailed = false;
    if (fragment.prefixItems) {
      fragment.prefixItems.forEach((item, i) => {
        if (i >= value.length) return;
        const r = validateFragment(item, value[i], `${path}[${i}]`, coerce);
        if (!r.ok) {
          anyFailed = true;
          itemErrors.push(...r.errors);
        } else {
          value[i] = r.value;
        }
      });
    }
    if (fragment.items) {
      value.forEach((item, i) => {
        const r = validateFragment(fragment.items as PropSchemaFragment, item, `${path}[${i}]`, coerce);
        if (!r.ok) {
          anyFailed = true;
          itemErrors.push(...r.errors);
        } else {
          value[i] = r.value;
        }
      });
    }
    if (anyFailed) {
      return { ok: false, value, errors: itemErrors };
    }
  }

  // --- object constraints ---
  if (isPlainObject(value)) {
    const errors: PropValidationError[] = [];
    let anyFailed = false;
    const record = value as Record<string, unknown>;
    if (fragment.required) {
      for (const req of fragment.required) {
        if (record[req] === undefined) {
          anyFailed = true;
          errors.push({ path: `${path}.${req}`, code: 'required', message: `Missing required property "${req}".` });
        }
      }
    }
    if (fragment.properties) {
      for (const [key, sub] of Object.entries(fragment.properties)) {
        if (record[key] === undefined) continue;
        const r = validateFragment(sub, record[key], `${path}.${key}`, coerce);
        if (!r.ok) {
          anyFailed = true;
          errors.push(...r.errors);
        } else {
          record[key] = r.value;
        }
      }
    }
    if (fragment.additionalProperties === false && fragment.properties) {
      for (const key of Object.keys(record)) {
        if (!Object.prototype.hasOwnProperty.call(fragment.properties, key)) {
          anyFailed = true;
          errors.push({
            path: `${path}.${key}`,
            code: 'additional_properties',
            message: `Property "${key}" is not allowed.`,
          });
        }
      }
    }
    if (anyFailed) {
      return { ok: false, value, errors };
    }
  }

  // --- union constraints ---
  if (fragment.oneOf) {
    const matches = fragment.oneOf.filter((branch) => {
      const r = validateFragment(branch, value, path, false);
      return r.ok;
    });
    if (matches.length !== 1) {
      return fail(path, 'one_of', `Value must match exactly one branch (matched ${matches.length}).`);
    }
  }
  if (fragment.anyOf) {
    const matched = fragment.anyOf.some((branch) => validateFragment(branch, value, path, false).ok);
    if (!matched) {
      return fail(path, 'any_of', 'Value must match at least one branch.');
    }
  }

  return ok(value);
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'null':
      return value === null;
    default:
      return false;
  }
}

const NO_COERCE = Symbol('no-coerce');

function coerceValue(types: string[], value: unknown): unknown {
  if (typeof value !== 'string') return NO_COERCE;
  const trimmed = value.trim();
  if (types.includes('number') || types.includes('integer')) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  if (types.includes('boolean')) {
    if (TRUE_STRINGS.has(trimmed.toLowerCase())) return true;
    if (FALSE_STRINGS.has(trimmed.toLowerCase())) return false;
  }
  return NO_COERCE;
}

function isValidFormat(format: string, value: string): boolean {
  switch (format) {
    case 'color':
      return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
        /^rgba?\(/.test(value) || /^hsla?\(/.test(value);
    case 'color-with-alpha':
      return /^#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/.test(value) || /^rgba?\(/.test(value) || /^hsla?\(/.test(value);
    case 'font-family':
      return value.trim().length > 0 && value.trim().length <= 120;
    case 'asset-ref':
      return /^[a-zA-Z0-9_-]+[/:][a-zA-Z0-9._-]+$/.test(value) || /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
    case 'data-binding':
      return value.length > 0;
    case 'enum-friendly-name':
      return value.length > 0 && value.length <= 80;
    default:
      return true;
  }
}

export function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  return false;
}

/** Loose equality for enum matching (string "42" == number 42). */
function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'string' && String(a) === b.trim()) return true;
  if (typeof b === 'number' && typeof a === 'string' && String(b) === a.trim()) return true;
  return false;
}
