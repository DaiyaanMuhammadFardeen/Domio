import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  callPrototypeRuntime,
  validateNumber,
  validateObject,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';

export interface CalculatorCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly name: string;
  readonly inputs: ReadonlyArray<{ name: string; type: 'number' | 'string' | 'boolean' }>;
  readonly expression: string;
}
export interface CalculatorComputeInput {
  readonly deckId: string;
  readonly calculatorId: string;
  readonly values: Record<string, number | string | boolean>;
}
export interface CalculatorListInput {
  readonly deckId: string;
}
export interface Calculator {
  readonly id: string;
  readonly name: string;
  readonly inputs: ReadonlyArray<unknown>;
  readonly expression: string;
}

function validateCreate(input: unknown): ValidationResult<CalculatorCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  const expression = validateString(o['expression'], 'expression', issues);
  if (!Array.isArray(o['inputs']) || (o['inputs'] as unknown[]).length === 0) {
    issues.push('inputs must be a non-empty array');
  }
  if (!deckId || !name || !expression || issues.length > 0) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const value: CalculatorCreateInput = id
    ? { deckId, id, name, inputs: o['inputs'] as CalculatorCreateInput['inputs'], expression }
    : { deckId, name, inputs: o['inputs'] as CalculatorCreateInput['inputs'], expression };
  return { ok: true, value };
}

function validateCompute(input: unknown): ValidationResult<CalculatorComputeInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const calculatorId = validateString(o['calculatorId'], 'calculatorId', issues);
  const values = validateObject(o['values'], 'values', issues);
  if (!deckId || !calculatorId || !values) return { ok: false, code: 'INVALID_INPUT', issues };
  return {
    ok: true,
    value: { deckId, calculatorId, values: values as Record<string, number | string | boolean> },
  };
}

function validateList(input: unknown): ValidationResult<CalculatorListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'calculators:read' | 'calculators:write' | 'calculators:compute') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
  void validateNumber;
}

export const create_calculator: McpTool<CalculatorCreateInput, Calculator> = {
  name: 'create_calculator',
  description: 'Create a calculator.',
  capability: 'calculators:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'calculators:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_calculator', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/calculators`, v.value).then(
        (r) => r as Calculator,
      ),
    );
  },
};

export const compute_calculator: McpTool<CalculatorComputeInput, { result: number | string | boolean }> = {
  name: 'compute_calculator',
  description: 'Evaluate a calculator with the given values.',
  capability: 'calculators:compute',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'calculators:compute');
    const v = validateCompute(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'compute_calculator', { ...v.value, values: '<<redacted>>' }, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/calculators/${v.value.calculatorId}/compute`,
        { values: v.value.values },
      ).then((r) => r as { result: number | string | boolean }),
    );
  },
};

export const list_calculators: McpTool<CalculatorListInput, readonly Calculator[]> = {
  name: 'list_calculators',
  description: 'List calculators.',
  capability: 'calculators:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'calculators:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_calculators', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/calculators`).then(
        (r) => (r as Calculator[]).slice(),
      ),
    );
  },
};

export const calculatorTools = [create_calculator, compute_calculator, list_calculators] as const;