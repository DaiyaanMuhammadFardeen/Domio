import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  callPrototypeRuntime,
  validateObject,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';

export interface FormCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly title: string;
  readonly fields: ReadonlyArray<{
    readonly id: string;
    readonly type: 'text' | 'email' | 'number' | 'select' | 'checkbox';
    readonly label: string;
    readonly required?: boolean;
  }>;
}
export interface FormUpdateInput {
  readonly deckId: string;
  readonly formId: string;
  readonly patch: Partial<FormCreateInput>;
}
export interface FormSubmitInput {
  readonly deckId: string;
  readonly formId: string;
  readonly values: Record<string, string | number | boolean>;
}
export interface FormListInput {
  readonly deckId: string;
}
export interface Form {
  readonly id: string;
  readonly title: string;
  readonly fields: ReadonlyArray<unknown>;
}

function validateCreate(input: unknown): ValidationResult<FormCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const title = validateString(o['title'], 'title', issues);
  if (!Array.isArray(o['fields']) || (o['fields'] as unknown[]).length === 0) {
    issues.push('fields must be a non-empty array');
  }
  if (!deckId || !title || issues.length > 0) return { ok: false, code: 'INVALID_INPUT', issues };
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const value: FormCreateInput = id
    ? { deckId, id, title, fields: o['fields'] as FormCreateInput['fields'] }
    : { deckId, title, fields: o['fields'] as FormCreateInput['fields'] };
  return { ok: true, value };
}

function validateUpdate(input: unknown): ValidationResult<FormUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const formId = validateString(o['formId'], 'formId', issues);
  const patch = validateObject(o['patch'], 'patch', issues);
  if (!deckId || !formId || !patch) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, formId, patch: patch as Partial<FormCreateInput> } };
}

function validateSubmit(input: unknown): ValidationResult<FormSubmitInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const formId = validateString(o['formId'], 'formId', issues);
  const values = validateObject(o['values'], 'values', issues);
  if (!deckId || !formId || !values) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, formId, values: values as Record<string, string | number | boolean> } };
}

function validateList(input: unknown): ValidationResult<FormListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'forms:read' | 'forms:write' | 'forms:submit') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_form: McpTool<FormCreateInput, Form> = {
  name: 'create_form',
  description: 'Create a form on a deck.',
  capability: 'forms:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'forms:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_form', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/forms`, v.value).then((r) => r as Form),
    );
  },
};

export const update_form: McpTool<FormUpdateInput, Form> = {
  name: 'update_form',
  description: 'Update a form.',
  capability: 'forms:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'forms:write');
    const v = validateUpdate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'update_form', v.value, () =>
      callPrototypeRuntime(ctx, 'PATCH', `/decks/${v.value.deckId}/forms/${v.value.formId}`, v.value.patch).then(
        (r) => r as Form,
      ),
    );
  },
};

export const submit_form: McpTool<FormSubmitInput, { accepted: boolean; submissionId: string }> = {
  name: 'submit_form',
  description: 'Submit values to a form.',
  capability: 'forms:submit',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'forms:submit');
    const v = validateSubmit(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'submit_form', { ...v.value, values: '<<redacted>>' }, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/forms/${v.value.formId}/submit`, {
        values: v.value.values,
      }).then((r) => r as { accepted: boolean; submissionId: string }),
    );
  },
};

export const list_forms: McpTool<FormListInput, readonly Form[]> = {
  name: 'list_forms',
  description: 'List forms.',
  capability: 'forms:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'forms:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_forms', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/forms`).then((r) => (r as Form[]).slice()),
    );
  },
};

export const formTools = [create_form, update_form, submit_form, list_forms] as const;