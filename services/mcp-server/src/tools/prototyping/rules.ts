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

export interface RuleCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly when: string;
  readonly then: string;
  readonly priority?: number;
  readonly enabled?: boolean;
}
export interface RuleUpdateInput {
  readonly deckId: string;
  readonly ruleId: string;
  readonly patch: Partial<RuleCreateInput>;
}
export interface RuleDeleteInput {
  readonly deckId: string;
  readonly ruleId: string;
}
export interface RuleListInput {
  readonly deckId: string;
}
export interface RuleTestInput {
  readonly deckId: string;
  readonly ruleId: string;
  readonly context: Record<string, unknown>;
}
export interface Rule {
  readonly id: string;
  readonly when: string;
  readonly then: string;
  readonly priority?: number;
  readonly enabled?: boolean;
}

function validateCreate(input: unknown): ValidationResult<RuleCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const when = validateString(o['when'], 'when', issues);
  const then = validateString(o['then'], 'then', issues);
  if (!deckId || !when || !then) return { ok: false, code: 'INVALID_INPUT', issues };
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const priority = typeof o['priority'] === 'number' ? o['priority'] : undefined;
  const enabled = typeof o['enabled'] === 'boolean' ? o['enabled'] : undefined;
  const base: RuleCreateInput = { deckId, when, then };
  let value: RuleCreateInput;
  if (id) {
    value = priority !== undefined
      ? enabled !== undefined
        ? { ...base, id, priority, enabled }
        : { ...base, id, priority }
      : enabled !== undefined
        ? { ...base, id, enabled }
        : { ...base, id };
  } else {
    value = priority !== undefined
      ? enabled !== undefined
        ? { ...base, priority, enabled }
        : { ...base, priority }
      : enabled !== undefined
        ? { ...base, enabled }
        : base;
  }
  return { ok: true, value };
}

function validateUpdate(input: unknown): ValidationResult<RuleUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const ruleId = validateString(o['ruleId'], 'ruleId', issues);
  const patch = validateObject(o['patch'], 'patch', issues);
  if (!deckId || !ruleId || !patch) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, ruleId, patch: patch as Partial<RuleCreateInput> } };
}

function validateDelete(input: unknown): ValidationResult<RuleDeleteInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const ruleId = validateString(o['ruleId'], 'ruleId', issues);
  if (!deckId || !ruleId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, ruleId } };
}

function validateList(input: unknown): ValidationResult<RuleListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function validateTest(input: unknown): ValidationResult<RuleTestInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const ruleId = validateString(o['ruleId'], 'ruleId', issues);
  const context = validateObject(o['context'], 'context', issues);
  if (!deckId || !ruleId || !context) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, ruleId, context } };
}

function gate(ctx: McpContext, cap: 'rules:read' | 'rules:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_rule: McpTool<RuleCreateInput, Rule> = {
  name: 'create_rule',
  description: 'Create a rule on a deck.',
  capability: 'rules:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'rules:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_rule', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/rules`, v.value).then((r) => r as Rule),
    );
  },
};

export const update_rule: McpTool<RuleUpdateInput, Rule> = {
  name: 'update_rule',
  description: 'Update a rule.',
  capability: 'rules:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'rules:write');
    const v = validateUpdate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'update_rule', v.value, () =>
      callPrototypeRuntime(ctx, 'PATCH', `/decks/${v.value.deckId}/rules/${v.value.ruleId}`, v.value.patch).then(
        (r) => r as Rule,
      ),
    );
  },
};

export const delete_rule: McpTool<RuleDeleteInput, { deleted: boolean }> = {
  name: 'delete_rule',
  description: 'Delete a rule.',
  capability: 'rules:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } } },
  handler: async (ctx, input) => {
    gate(ctx, 'rules:write');
    const v = validateDelete(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'delete_rule', v.value, () =>
      callPrototypeRuntime(ctx, 'DELETE', `/decks/${v.value.deckId}/rules/${v.value.ruleId}`).then(
        () => ({ deleted: true }),
      ),
    );
  },
};

export const list_rules: McpTool<RuleListInput, readonly Rule[]> = {
  name: 'list_rules',
  description: 'List rules on a deck.',
  capability: 'rules:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'rules:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_rules', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/rules`).then((r) => (r as Rule[]).slice()),
    );
  },
};

export const test_rule: McpTool<RuleTestInput, { matched: boolean; result?: unknown }> = {
  name: 'test_rule',
  description: 'Test a rule against a context.',
  capability: 'rules:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'rules:read');
    const v = validateTest(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'test_rule', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/rules/${v.value.ruleId}/test`,
        { context: v.value.context },
      ).then((r) => r as { matched: boolean; result?: unknown }),
    );
  },
};

export const ruleTools = [create_rule, update_rule, delete_rule, list_rules, test_rule] as const;