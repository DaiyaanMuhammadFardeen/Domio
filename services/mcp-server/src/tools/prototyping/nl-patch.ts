import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  validateObject,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';
import { create_hotspot, update_hotspot, delete_hotspot } from './hotspots.js';
import { create_rule, update_rule, delete_rule } from './rules.js';
import { create_variable, update_variable, delete_variable, set_variable } from './variables.js';
import { list_hotspots } from './hotspots.js';

export interface ToolCall {
  readonly toolName: string;
  readonly input: unknown;
  readonly inverseInput?: unknown;
}

export interface NlPatchArgs {
  readonly deckId: string;
  readonly prompt: string;
}

export interface NlPatchHandle {
  readonly toolCalls: readonly ToolCall[];
  apply(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Decompose a natural-language patch into tool calls.
 *
 * Keyword-based heuristic, intentionally simple.  The MCP host UI presents
 * the result as a diff to the user before applying.
 */
export function nlDecompose(prompt: string, deckId: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const lower = prompt.toLowerCase();

  const idMatch = lower.match(/\b(?:id\s*[:=]\s*|named?\s+)([\w-]+)/);
  let id = idMatch?.[1];
  // For "set variable foo to N" capture the variable name from the "set variable X" prefix
  if (!id) {
    const sv = lower.match(/\bset\s+variable\s+([\w-]+)/);
    if (sv) id = sv[1];
  }
  if (!id) {
    const mv = lower.match(/\bmove\s+hotspot\s+(?:named\s+|id[:=]\s*)?([\w-]+)/);
    if (mv) id = mv[1];
  }
  if (!id) {
    const dr = lower.match(/\b(?:delete|remove)\s+rule\s+(?:named\s+|id[:=]\s*)?([\w-]+)/);
    if (dr) id = dr[1];
  }

  if (/\b(move|resize|relocate|update)\b.*\bhotspot\b/.test(lower)) {
    if (id) {
      calls.push({
        toolName: 'update_hotspot',
        input: { deckId, hotspotId: id, patch: { label: prompt.slice(0, 64) } },
        inverseInput: { deckId, hotspotId: id, patch: { label: 'original' } },
      });
    }
  } else if (/\b(delete|remove)\b.*\bhotspot\b/.test(lower)) {
    if (id) calls.push({ toolName: 'delete_hotspot', input: { deckId, hotspotId: id } });
  } else if (/\b(add|create)\b.*\bhotspot\b/.test(lower)) {
    calls.push({
      toolName: 'create_hotspot',
      input: {
        deckId,
        slideId: 'default',
        kind: 'cta',
        rect: { x: 0, y: 0, w: 100, h: 40 },
        label: prompt.slice(0, 64),
      },
      inverseInput: { deckId, hotspotId: 'pending' },
    });
  }

  if (/\badd\b.*\b(rule|condition)\b/.test(lower)) {
    calls.push({
      toolName: 'create_rule',
      input: { deckId, when: 'true', then: 'noop', enabled: true },
      inverseInput: { deckId, ruleId: 'pending' },
    });
  } else if (/\bupdate\b.*\b(rule|condition)\b/.test(lower) && id) {
    calls.push({
      toolName: 'update_rule',
      input: { deckId, ruleId: id, patch: { then: prompt.slice(0, 64) } },
      inverseInput: { deckId, ruleId: id, patch: { then: 'original' } },
    });
  } else if (/\b(delete|remove)\b.*\b(rule|condition)\b/.test(lower) && id) {
    calls.push({ toolName: 'delete_rule', input: { deckId, ruleId: id } });
  }

  if (/\bset\b.*\bvariable\b/.test(lower) && id) {
    const numMatch = lower.match(/(?:to|=)\s*(-?\d+(?:\.\d+)?)/);
    if (numMatch) {
      const value = parseFloat(numMatch[1] ?? '0');
      calls.push({
        toolName: 'set_variable',
        input: { deckId, name: id, value },
        inverseInput: { deckId, name: id, value: 0 },
      });
    }
  }
  return calls;
}

function validateArgs(input: unknown): ValidationResult<NlPatchArgs> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const prompt = validateString(o['prompt'], 'prompt', issues);
  if (!deckId || !prompt) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, prompt } };
}

async function dispatch(ctx: McpContext, tool: McpTool<unknown, unknown>, input: unknown): Promise<unknown> {
  const t = tool as unknown as { handler: (ctx: McpContext, input: unknown) => Promise<unknown> };
  switch (tool.name) {
    case 'create_hotspot':
      return (create_hotspot as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'update_hotspot':
      return (update_hotspot as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'delete_hotspot':
      return (delete_hotspot as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'create_rule':
      return (create_rule as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'update_rule':
      return (update_rule as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'delete_rule':
      return (delete_rule as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'create_variable':
      return (create_variable as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'update_variable':
      return (update_variable as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'delete_variable':
      return (delete_variable as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'set_variable':
      return (set_variable as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    case 'list_hotspots':
      return (list_hotspots as unknown as McpTool<unknown, unknown>).handler(ctx, input);
    default:
      throw new MCPError('RUNTIME_ERROR', `unsupported tool in nl-patch: ${tool.name}`);
  }
  void t;
}

const TOOL_MAP = new Map<string, McpTool<unknown, unknown>>(
  [
    'create_hotspot',
    'update_hotspot',
    'delete_hotspot',
    'create_rule',
    'update_rule',
    'delete_rule',
    'create_variable',
    'update_variable',
    'delete_variable',
    'set_variable',
  ].map((name) => {
    const t = (
      [
        create_hotspot,
        update_hotspot,
        delete_hotspot,
        create_rule,
        update_rule,
        delete_rule,
        create_variable,
        update_variable,
        delete_variable,
        set_variable,
      ] as McpTool<unknown, unknown>[]
    ).find((tool) => tool.name === name);
    if (!t) throw new MCPError('RUNTIME_ERROR', `tool not registered: ${name}`);
    return [name, t] as const;
  }),
);

export function nlPatch(ctx: McpContext, deckId: string, prompt: string): NlPatchHandle {
  const claim = claimCapability(ctx.agentId, 'nl-patch');
  if (!claim.granted) throw new MCPError('PERMISSION_DENIED', claim.reason ?? 'permission denied');
  const toolCalls = nlDecompose(prompt, deckId);

  let applied = false;
  const appliedCalls: ToolCall[] = [];

  const apply = async (): Promise<void> => {
    const snapshot = await list_hotspots.handler(ctx, { deckId }).catch(() => []);
    void snapshot;
    for (const call of toolCalls) {
      const tool = TOOL_MAP.get(call.toolName);
      if (!tool) throw new MCPError('RUNTIME_ERROR', `unknown tool: ${call.toolName}`);
      await dispatch(ctx, tool, call.input);
      appliedCalls.push(call);
    }
    applied = true;
  };

  const rollback = async (): Promise<void> => {
    if (!applied) return;
    for (const call of appliedCalls.slice().reverse()) {
      if (!call.inverseInput) continue;
      const tool = TOOL_MAP.get(call.toolName);
      if (!tool) continue;
      try {
        await dispatch(ctx, tool, call.inverseInput);
      } catch {
        throw new MCPError('ROLLBACK_FAILED', `could not undo ${call.toolName}`);
      }
    }
    applied = false;
  };

  return { toolCalls, apply, rollback };
}

export const nl_patch_tool: McpTool<NlPatchArgs, { toolCalls: readonly ToolCall[] }> = {
  name: 'nl_patch',
  description: 'Decompose a natural-language patch into tool calls.',
  capability: 'nl-patch',
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    properties: {
      toolCalls: { type: 'array', items: { type: 'object' } },
    },
  },
  handler: async (ctx, input) => {
    const v = validateArgs(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    if (!validateObject) throw new MCPError('RUNTIME_ERROR', 'validateObject missing');
    return withAuditTrail(ctx, 'nl_patch', { ...v.value, prompt: '<<redacted>>' }, async () => {
      const handle = nlPatch(ctx, v.value.deckId, v.value.prompt);
      return { toolCalls: handle.toolCalls };
    });
  },
};

export const nlPatchTools = [nl_patch_tool] as const;
