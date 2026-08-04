/**
 * Shared types for the forms module (Phase 10 M4.1).
 *
 * The runtime side is pure TS and tenant-agnostic. Persistence lives
 * in `services/prototype-runtime` and mirrors these shapes via
 * `form-v1.schema.json` + the wire contract.
 */

/** All input types supported by the runtime. 20 in total. */
export type InputType =
  | 'text'
  | 'number'
  | 'email'
  | 'url'
  | 'tel'
  | 'password'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'time'
  | 'datetime'
  | 'range'
  | 'slider'
  | 'file'
  | 'signature'
  | 'richtext'
  | 'color';

/** Opaque form identifier — kebab-case ULID-style strings accepted. */
export type FormId = string;

/** Stable, user-visible label for a form. */
export type FormLabel = string;

/** A single validator attached to an input. */
export type Validator =
  | { readonly kind: 'required' }
  | { readonly kind: 'min'; readonly value: number }
  | { readonly kind: 'max'; readonly value: number }
  | { readonly kind: 'minLength'; readonly value: number }
  | { readonly kind: 'maxLength'; readonly value: number }
  | { readonly kind: 'pattern'; readonly value: string; readonly flags?: string }
  | { readonly kind: 'crossField'; readonly field: string; readonly rule: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' }
  | { readonly kind: 'async'; readonly debounceMs?: number; readonly check: 'unique-email' | 'unique-handle' | 'custom'; readonly endpoint?: string };

/** Definition for a single input on a form. */
export interface InputDefinition {
  readonly name: string;
  readonly label: string;
  readonly type: InputType;
  /** Optional: default initial value used by `defaultValue`. */
  readonly defaultValue?: unknown;
  /** Optional placeholder text. */
  readonly placeholder?: string;
  /** Help text shown below the input. */
  readonly helpText?: string;
  /** Validator chain. Evaluated in order; first failure short-circuits. */
  readonly validators?: readonly Validator[];
  /** For `select` / `radio` / `multiselect`: option list. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** For `range` / `slider`: min/max/step. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Whether this input must be filled (also expressed as a `required` validator). */
  readonly required?: boolean;
  /** Whether multiple values are allowed (file, multiselect). */
  readonly multiple?: boolean;
  /** Whether to render this input as a controlled read-only field. */
  readonly readOnly?: boolean;
  /** Multiline height for `textarea`. */
  readonly rows?: number;
}

/** A full form definition. */
export interface FormDefinition {
  readonly name: FormLabel;
  readonly description?: string;
  readonly inputs: readonly InputDefinition[];
  /** When provided, replaces the default "Submit" button label. */
  readonly submitLabel?: string;
  /** Auto-save draft cadence, in ms. 0 disables autosave. */
  readonly autosaveIntervalMs?: number;
}

/** Persisted form record (tenant-scoped). Mirrors `form-v1.schema.json`. */
export interface FormRecord {
  readonly id: FormId;
  readonly tenantId: string;
  readonly deckId: string;
  readonly slideId: string;
  readonly name: string;
  readonly description?: string;
  readonly inputs: readonly InputDefinition[];
  readonly submitLabel?: string;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Map of input name → current value. Values are coerced via `coerce`. */
export type FormValues = Readonly<Record<string, unknown>>;

/** Stable error codes returned by validation. */
export type ErrorCode =
  | 'REQUIRED'
  | 'MIN'
  | 'MAX'
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'PATTERN'
  | 'CROSS_FIELD'
  | 'TYPE_MISMATCH'
  | 'ASYNC_PENDING'
  | 'ASYNC_FAILED'
  | 'INVALID_OPTION'
  | 'OUT_OF_RANGE'
  | 'INVALID_FILE'
  | 'INVALID_SIGNATURE'
  | 'FORM_NOT_FOUND';

/** Per-input error codes, keyed by input name. */
export type FormErrors = Readonly<Record<string, readonly ErrorCode[]>>;

/** Validation result. `ok: true` always carries the coerced values. */
export type FormValidationResult =
  | { readonly ok: true; readonly value: FormValues }
  | { readonly ok: false; readonly errors: FormErrors };

/** Input-coercion return value. */
export type CoercionResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ErrorCode };

/** Signature pad payload (data URL or stroke-list). */
export type SignaturePayload = string | readonly { readonly x: number; readonly y: number; readonly t: number }[];

/** File upload value. */
export interface FileValue {
  readonly name: string;
  readonly size: number;
  readonly mimeType: string;
  readonly url?: string;
}
