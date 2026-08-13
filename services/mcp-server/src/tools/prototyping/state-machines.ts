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

export interface StateMachineSpec {
  readonly deckId: string;
  readonly id: string;
  readonly initial: string;
  readonly states: ReadonlyArray<{
    readonly id: string;
    readonly on?: Record<string, string>;
  }>;
}

export interface TransitionStateInput {
  readonly deckId: string;
  readonly machineId: string;
  readonly from: string;
  readonly event: string;
}

export interface ListStateMachinesInput {
  readonly deckId: string;
}

export interface StateMachine {
  readonly id: string;
  readonly initial: string;
  readonly states: ReadonlyArray<unknown>;
}

function validateSetStateMachine(input: unknown): ValidationResult<StateMachineSpec> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const id = validateString(o['id'], 'id', issues);
  const initial = validateString(o['initial'], 'initial', issues);
  const statesRaw = o['states'];
  if (!Array.isArray(statesRaw) || statesRaw.length === 0) {
    issues.push('states must be a non-empty array');
  }
  if (!deckId || !id || !initial || issues.length > 0) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const states = statesRaw as StateMachineSpec['states'];
  return { ok: true, value: { deckId, id, initial, states } };
}

function validateTransitionState(input: unknown): ValidationResult<TransitionStateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const machineId = validateString(o['machineId'], 'machineId', issues);
  const from = validateString(o['from'], 'from', issues);
  const event = validateString(o['event'], 'event', issues);
  if (!deckId || !machineId || !from || !event) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, machineId, from, event } };
}

function validateListStateMachines(input: unknown): ValidationResult<ListStateMachinesInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'state-machines:read' | 'state-machines:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
  void validateObject;
}

export const set_state_machine: McpTool<StateMachineSpec, StateMachine> = {
  name: 'set_state_machine',
  description: 'Create or replace a state machine on a deck.',
  capability: 'state-machines:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'state-machines:write');
    const v = validateSetStateMachine(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'set_state_machine', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'PUT',
        `/decks/${v.value.deckId}/state-machines/${v.value.id}`,
        v.value,
      ).then((r) => r as StateMachine),
    );
  },
};

export const transition_state: McpTool<TransitionStateInput, { to: string }> = {
  name: 'transition_state',
  description: 'Trigger a state transition.',
  capability: 'state-machines:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'state-machines:write');
    const v = validateTransitionState(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'transition_state', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/state-machines/${v.value.machineId}/transition`,
        { from: v.value.from, event: v.value.event },
      ).then((r) => r as { to: string }),
    );
  },
};

export const list_state_machines: McpTool<ListStateMachinesInput, readonly StateMachine[]> = {
  name: 'list_state_machines',
  description: 'List state machines on a deck.',
  capability: 'state-machines:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'state-machines:read');
    const v = validateListStateMachines(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_state_machines', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/state-machines`).then((r) =>
        (r as StateMachine[]).slice(),
      ),
    );
  },
};

export const stateMachineTools = [
  set_state_machine,
  transition_state,
  list_state_machines,
] as const;
