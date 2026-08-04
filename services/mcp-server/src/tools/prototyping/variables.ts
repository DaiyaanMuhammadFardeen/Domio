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

export interface VariableCreateInput {
  readonly deckId: string;
  readonly name: string;
  readonly type: 'number' | 'string' | 'boolean';
  readonly default: number | string | boolean;
  readonly scope?: 'slide' | 'deck';
}
export interface VariableUpdateInput {
  readonly deckId: string;
  readonly name: string;
  readonly patch: Partial<VariableCreateInput>;
}
export interface VariableDeleteInput {
  readonly deckId: string;
  readonly name: string;
}
export interface VariableListInput {
  readonly deckId: string;
}
export interface VariableSetInput {
  readonly deckId: string;
  readonly name: string;
  readonly value: number | string | boolean;
}
export interface Variable {
  readonly name: string;
  readonly type: VariableCreateInput['type'];
  readonly value: number | string | boolean;
  readonly scope?: 'slide' | 'deck';
}

const TYPES = ['number', 'string', 'boolean'] as const;

function validateCreate(input: unknown): ValidationResult<VariableCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  const typeRaw = o['type'];
  if (typeof typeRaw !== 'string' || !TYPES.includes(typeRaw as (typeof TYPES)[number])) {
    issues.push(`type must be one of ${TYPES.join(', ')}`);
  }
  if (!Object.prototype.hasOwnProperty.call(o, 'default')) issues.push('default is required');
  if (!deckId || !name || issues.length > 0) return { ok: false, code: 'INVALID_INPUT', issues };
  const type = typeRaw as VariableCreateInput['type'];
  const defaultVal = o['default'] as VariableCreateInput['default'];
  const scope =
    o['scope'] === 'slide' || o['scope'] === 'deck' ? o['scope'] : undefined;
  const value: VariableCreateInput = scope
    ? { deckId, name, type, default: defaultVal, scope }
    : { deckId, name, type, default: defaultVal };
  return { ok: true, value };
}

function validateUpdate(input: unknown): ValidationResult<VariableUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  const patch = validateObject(o['patch'], 'patch', issues);
  if (!deckId || !name || !patch) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, name, patch: patch as Partial<VariableCreateInput> } };
}

function validateDelete(input: unknown): ValidationResult<VariableDeleteInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  if (!deckId || !name) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, name } };
}

function validateList(input: unknown): ValidationResult<VariableListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function validateSet(input: unknown): ValidationResult<VariableSetInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  if (!deckId || !name) return { ok: false, code: 'INVALID_INPUT', issues };
  const valueRaw = o['value'];
  if (
    typeof valueRaw !== 'number' &&
    typeof valueRaw !== 'string' &&
    typeof valueRaw !== 'boolean'
  ) {
    issues.push('value must be number, string, or boolean');
  }
  if (issues.length > 0) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, name, value: valueRaw as VariableSetInput['value'] } };
}

function gate(
  ctx: McpContext,
  cap: 'variables:read' | 'variables:write',
) {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_variable: McpTool<VariableCreateInput, Variable> = {
  name: 'create_variable',
  description: 'Create a variable on a deck.',
  capability: 'variables:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'variables:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_variable', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/variables`, v.value).then(
        (r) => r as Variable,
      ),
    );
  },
};

export const update_variable: McpTool<VariableUpdateInput, Variable> = {
  name: 'update_variable',
  description: 'Update an existing variable.',
  capability: 'variables:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'variables:write');
    const v = validateUpdate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'update_variable', v.value, () =>
      callPrototypeRuntime(ctx, 'PATCH', `/decks/${v.value.deckId}/variables/${v.value.name}`, v.value.patch).then(
        (r) => r as Variable,
      ),
    );
  },
};

export const delete_variable: McpTool<VariableDeleteInput, { deleted: boolean }> = {
  name: 'delete_variable',
  description: 'Delete a variable.',
  capability: 'variables:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } } },
  handler: async (ctx, input) => {
    gate(ctx, 'variables:write');
    const v = validateDelete(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'delete_variable', v.value, () =>
      callPrototypeRuntime(ctx, 'DELETE', `/decks/${v.value.deckId}/variables/${v.value.name}`).then(
        () => ({ deleted: true }),
      ),
    );
  },
};

export const list_variables: McpTool<VariableListInput, readonly Variable[]> = {
  name: 'list_variables',
  description: 'List all variables on a deck.',
  capability: 'variables:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'variables:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_variables', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/variables`).then(
        (r) => (r as Variable[]).slice(),
      ),
    );
  },
};

export const set_variable: McpTool<VariableSetInput, Variable> = {
  name: 'set_variable',
  description: 'Set a variable value.',
  capability: 'variables:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'variables:write');
    const v = validateSet(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'set_variable', v.value, () =>
      callPrototypeRuntime(ctx, 'PUT', `/decks/${v.value.deckId}/variables/${v.value.name}/value`, {
        value: v.value.value,
      }).then((r) => r as Variable),
    );
  },
};

export const variableTools = [
  create_variable,
  update_variable,
  delete_variable,
  list_variables,
  set_variable,
] as const;