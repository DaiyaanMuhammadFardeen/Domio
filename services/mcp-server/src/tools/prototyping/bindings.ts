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

export interface BindingCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly source: string;
  readonly target: string;
  readonly transform?: string;
}
export interface BindingUpdateInput {
  readonly deckId: string;
  readonly bindingId: string;
  readonly patch: Partial<BindingCreateInput>;
}
export interface BindingDeleteInput {
  readonly deckId: string;
  readonly bindingId: string;
}
export interface BindingListInput {
  readonly deckId: string;
}
export interface Binding {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly transform?: string;
}

function validateCreate(input: unknown): ValidationResult<BindingCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const source = validateString(o['source'], 'source', issues);
  const target = validateString(o['target'], 'target', issues);
  if (!deckId || !source || !target) return { ok: false, code: 'INVALID_INPUT', issues };
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const transform = typeof o['transform'] === 'string' ? o['transform'] : undefined;
  let value: BindingCreateInput;
  if (id) {
    value = transform ? { deckId, id, source, target, transform } : { deckId, id, source, target };
  } else {
    value = transform ? { deckId, source, target, transform } : { deckId, source, target };
  }
  return { ok: true, value };
}

function validateUpdate(input: unknown): ValidationResult<BindingUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const bindingId = validateString(o['bindingId'], 'bindingId', issues);
  const patch = validateObject(o['patch'], 'patch', issues);
  if (!deckId || !bindingId || !patch) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, bindingId, patch: patch as Partial<BindingCreateInput> } };
}

function validateDelete(input: unknown): ValidationResult<BindingDeleteInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const bindingId = validateString(o['bindingId'], 'bindingId', issues);
  if (!deckId || !bindingId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, bindingId } };
}

function validateList(input: unknown): ValidationResult<BindingListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'bindings:read' | 'bindings:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_binding: McpTool<BindingCreateInput, Binding> = {
  name: 'create_binding',
  description: 'Create a binding.',
  capability: 'bindings:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'bindings:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_binding', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/bindings`, v.value).then(
        (r) => r as Binding,
      ),
    );
  },
};

export const update_binding: McpTool<BindingUpdateInput, Binding> = {
  name: 'update_binding',
  description: 'Update a binding.',
  capability: 'bindings:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'bindings:write');
    const v = validateUpdate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'update_binding', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'PATCH',
        `/decks/${v.value.deckId}/bindings/${v.value.bindingId}`,
        v.value.patch,
      ).then((r) => r as Binding),
    );
  },
};

export const delete_binding: McpTool<BindingDeleteInput, { deleted: boolean }> = {
  name: 'delete_binding',
  description: 'Delete a binding.',
  capability: 'bindings:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } } },
  handler: async (ctx, input) => {
    gate(ctx, 'bindings:write');
    const v = validateDelete(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'delete_binding', v.value, () =>
      callPrototypeRuntime(ctx, 'DELETE', `/decks/${v.value.deckId}/bindings/${v.value.bindingId}`).then(
        () => ({ deleted: true }),
      ),
    );
  },
};

export const list_bindings: McpTool<BindingListInput, readonly Binding[]> = {
  name: 'list_bindings',
  description: 'List bindings.',
  capability: 'bindings:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'bindings:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_bindings', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/bindings`).then(
        (r) => (r as Binding[]).slice(),
      ),
    );
  },
};

export const bindingTools = [create_binding, update_binding, delete_binding, list_bindings] as const;