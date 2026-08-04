/**
 * FormRegistry — author-time registry of forms for the prototype
 * runtime. Each form has a stable id and a `FormDefinition` describing
 * its inputs and per-input validator chain.
 *
 * Phase 10 M4.1 — see `docs/development_phases/phase-10 §M4`.
 */

import type {
  FormDefinition,
  FormId,
  FormValidationResult,
  FormValues,
  InputDefinition,
  InputType,
} from './types.js';
import { validateForm } from './input-validator.js';

export class FormRegistry {
  private readonly forms = new Map<FormId, FormDefinition>();

  /** Define (or redefine) a form. Re-defining overwrites any prior def. */
  define(formId: FormId, def: FormDefinition): void {
    if (!formId) throw new Error('formId is required');
    validateShape(def);
    this.forms.set(formId, def);
  }

  /** Get a registered form definition, or null if absent. */
  get(formId: FormId): FormDefinition | null {
    return this.forms.get(formId) ?? null;
  }

  /** Whether the given formId has a definition. */
  has(formId: FormId): boolean {
    return this.forms.has(formId);
  }

  /** Number of registered forms. */
  size(): number {
    return this.forms.size;
  }

  /** Remove a form definition. */
  remove(formId: FormId): boolean {
    return this.forms.delete(formId);
  }

  /** Enumerate every (id, def) pair. */
  entries(): IterableIterator<readonly [FormId, FormDefinition]> {
    return this.forms.entries();
  }

  /** Validate a set of values against the registered definition. */
  validate(formId: FormId, values: FormValues): FormValidationResult {
    const def = this.forms.get(formId);
    if (!def) {
      return {
        ok: false,
        errors: { _form: ['FORM_NOT_FOUND'] },
      };
    }
    return validateForm(def, values);
  }
}

// ── Internal: shape check on `define()` ────────────────────────────────

function validateShape(def: FormDefinition): void {
  if (!def.name || def.name.length < 1 || def.name.length > 128) {
    throw new Error('FormDefinition.name must be 1..128 chars');
  }
  if (!Array.isArray(def.inputs) || def.inputs.length === 0) {
    throw new Error('FormDefinition.inputs must be a non-empty array');
  }
  const seen = new Set<string>();
  for (const inp of def.inputs) {
    if (!inp.name) throw new Error('Every input requires a name');
    if (seen.has(inp.name)) {
      throw new Error(`Duplicate input name: ${inp.name}`);
    }
    seen.add(inp.name);
    if (!ALLOWED_TYPES.has(inp.type)) {
      throw new Error(`Unknown input type: ${inp.type}`);
    }
  }
  if (def.submitLabel !== undefined && (def.submitLabel.length < 1 || def.submitLabel.length > 64)) {
    throw new Error('submitLabel must be 1..64 chars when provided');
  }
}

const ALLOWED_TYPES: ReadonlySet<InputType> = new Set<InputType>([
  'text', 'number', 'email', 'url', 'tel', 'password', 'textarea',
  'select', 'multiselect', 'checkbox', 'radio', 'date', 'time',
  'datetime', 'range', 'slider', 'file', 'signature', 'richtext', 'color',
] satisfies InputType[]);
