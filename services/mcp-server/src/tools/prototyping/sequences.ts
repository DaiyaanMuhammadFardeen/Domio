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

export interface SequenceCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly name: string;
  readonly steps: ReadonlyArray<{ id: string; durationMs: number; target: string }>;
}
export interface SequenceStartInput {
  readonly deckId: string;
  readonly sequenceId: string;
}
export interface SequencePauseInput {
  readonly deckId: string;
  readonly sequenceId: string;
}
export interface SequenceListInput {
  readonly deckId: string;
}
export interface Sequence {
  readonly id: string;
  readonly name: string;
  readonly steps: ReadonlyArray<unknown>;
}

function validateCreate(input: unknown): ValidationResult<SequenceCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  if (!Array.isArray(o['steps']) || (o['steps'] as unknown[]).length === 0) {
    issues.push('steps must be a non-empty array');
  }
  if (!deckId || !name || issues.length > 0) return { ok: false, code: 'INVALID_INPUT', issues };
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const value: SequenceCreateInput = id
    ? { deckId, id, name, steps: o['steps'] as SequenceCreateInput['steps'] }
    : { deckId, name, steps: o['steps'] as SequenceCreateInput['steps'] };
  return { ok: true, value };
}

function validateStart(input: unknown): ValidationResult<SequenceStartInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const sequenceId = validateString(o['sequenceId'], 'sequenceId', issues);
  if (!deckId || !sequenceId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, sequenceId } };
}

function validateList(input: unknown): ValidationResult<SequenceListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
  void validateObject;
}

function gate(ctx: McpContext, cap: 'sequences:read' | 'sequences:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_sequence: McpTool<SequenceCreateInput, Sequence> = {
  name: 'create_sequence',
  description: 'Create a presentation sequence.',
  capability: 'sequences:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'sequences:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_sequence', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/sequences`, v.value).then(
        (r) => r as Sequence,
      ),
    );
  },
};

export const start_sequence: McpTool<SequenceStartInput, { started: boolean }> = {
  name: 'start_sequence',
  description: 'Start a presentation sequence.',
  capability: 'sequences:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'sequences:write');
    const v = validateStart(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'start_sequence', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/sequences/${v.value.sequenceId}/start`,
      ).then(() => ({ started: true })),
    );
  },
};

export const pause_sequence: McpTool<SequencePauseInput, { paused: boolean }> = {
  name: 'pause_sequence',
  description: 'Pause a presentation sequence.',
  capability: 'sequences:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'sequences:write');
    const v = validateStart(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'pause_sequence', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${v.value.deckId}/sequences/${v.value.sequenceId}/pause`,
      ).then(() => ({ paused: true })),
    );
  },
};

export const list_sequences: McpTool<SequenceListInput, readonly Sequence[]> = {
  name: 'list_sequences',
  description: 'List sequences.',
  capability: 'sequences:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'sequences:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_sequences', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/sequences`).then((r) =>
        (r as Sequence[]).slice(),
      ),
    );
  },
};

export const sequenceTools = [
  create_sequence,
  start_sequence,
  pause_sequence,
  list_sequences,
] as const;
