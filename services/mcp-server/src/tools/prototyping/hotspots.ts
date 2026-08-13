import type { Capability, McpContext } from '@domio/agent-schema';
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

export interface HotspotCreateInput {
  readonly deckId: string;
  readonly slideId: string;
  readonly id?: string;
  readonly kind: 'cta' | 'tooltip' | 'region';
  readonly rect: { x: number; y: number; w: number; h: number };
  readonly label?: string;
  readonly target?: string;
  readonly metadata?: Record<string, unknown>;
}
export interface HotspotUpdateInput {
  readonly deckId: string;
  readonly hotspotId: string;
  readonly patch: Partial<HotspotCreateInput>;
}
export interface HotspotDeleteInput {
  readonly deckId: string;
  readonly hotspotId: string;
}
export interface HotspotListInput {
  readonly deckId: string;
  readonly slideId?: string;
}
export interface Hotspot {
  readonly id: string;
  readonly slideId: string;
  readonly kind: 'cta' | 'tooltip' | 'region';
  readonly rect: { x: number; y: number; w: number; h: number };
  readonly label?: string;
  readonly target?: string;
  readonly metadata?: Record<string, unknown>;
}

const ALLOWED_KINDS = ['cta', 'tooltip', 'region'] as const;

export function validateHotspotCreate(input: unknown): ValidationResult<HotspotCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const slideId = validateString(o['slideId'], 'slideId', issues);
  const kind = validateEnumField(o['kind'], 'kind', ALLOWED_KINDS, issues);
  const rectRaw = o['rect'];
  let rect: HotspotCreateInput['rect'] | null = null;
  if (!validateObject(rectRaw, 'rect', issues)) rect = null;
  else {
    const r = rectRaw as Record<string, unknown>;
    const x = typeof r['x'] === 'number' ? r['x'] : null;
    const y = typeof r['y'] === 'number' ? r['y'] : null;
    const w = typeof r['w'] === 'number' ? r['w'] : null;
    const h = typeof r['h'] === 'number' ? r['h'] : null;
    if (x === null || y === null || w === null || h === null) {
      issues.push('rect must contain numeric x, y, w, h');
    } else {
      rect = { x, y, w, h };
    }
  }
  if (!deckId || !slideId || !kind || !rect) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const label = typeof o['label'] === 'string' ? o['label'] : undefined;
  const target = typeof o['target'] === 'string' ? o['target'] : undefined;
  const metadata =
    o['metadata'] && typeof o['metadata'] === 'object' && !Array.isArray(o['metadata'])
      ? (o['metadata'] as Record<string, unknown>)
      : undefined;
  const value: HotspotCreateInput = id
    ? label
      ? target
        ? metadata
          ? { deckId, slideId, id, kind, rect, label, target, metadata }
          : { deckId, slideId, id, kind, rect, label, target }
        : metadata
          ? { deckId, slideId, id, kind, rect, metadata }
          : { deckId, slideId, id, kind, rect }
      : { deckId, slideId, id, kind, rect }
    : { deckId, slideId, kind, rect };
  // exactOptionalPropertyTypes: don't emit undefined keys
  return { ok: true, value };
}

function validateEnumField<T extends string>(
  input: unknown,
  field: string,
  allowed: readonly T[],
  issues: string[],
): T | null {
  if (typeof input !== 'string' || !allowed.includes(input as T)) {
    issues.push(`${field} must be one of ${allowed.join(', ')}`);
    return null;
  }
  return input as T;
}

export function validateHotspotUpdate(input: unknown): ValidationResult<HotspotUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const hotspotId = validateString(o['hotspotId'], 'hotspotId', issues);
  if (!deckId || !hotspotId || issues.length > 0) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const patchObj = validateObject(o['patch'], 'patch', issues);
  if (!patchObj) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const patch = patchObj as Partial<HotspotCreateInput>;
  return { ok: true, value: { deckId, hotspotId, patch } };
}

export function validateHotspotDelete(input: unknown): ValidationResult<HotspotDeleteInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const hotspotId = validateString(o['hotspotId'], 'hotspotId', issues);
  if (!deckId || !hotspotId) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  return { ok: true, value: { deckId, hotspotId } };
}

export function validateHotspotList(input: unknown): ValidationResult<HotspotListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  const slideId = typeof o['slideId'] === 'string' ? o['slideId'] : undefined;
  return {
    ok: true,
    value: slideId ? { deckId, slideId } : { deckId },
  };
}

function gateOrThrow(ctx: McpContext, capability: Capability, allowRead = false) {
  const c = claimCapability(ctx.agentId, capability);
  if (!c.granted) {
    throw new MCPError('PERMISSION_DENIED', c.reason ?? 'permission denied');
  }
  void allowRead;
}

export const create_hotspot: McpTool<HotspotCreateInput, Hotspot> = {
  name: 'create_hotspot',
  description: 'Create a hotspot on a slide.',
  capability: 'hotspots:write',
  inputSchema: {
    type: 'object',
    required: ['deckId', 'slideId', 'kind', 'rect'],
    properties: {
      deckId: { type: 'string' },
      slideId: { type: 'string' },
      id: { type: 'string' },
      kind: { enum: ['cta', 'tooltip', 'region'] },
      rect: {
        type: 'object',
        required: ['x', 'y', 'w', 'h'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number' },
          h: { type: 'number' },
        },
      },
      label: { type: 'string' },
      target: { type: 'string' },
      metadata: { type: 'object' },
    },
  },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gateOrThrow(ctx, 'hotspots:write');
    const validated = validateHotspotCreate(input);
    if (!validated.ok) {
      throw new MCPError('INVALID_INPUT', 'invalid input', validated.issues);
    }
    return withAuditTrail(ctx, 'create_hotspot', validated.value, () =>
      callPrototypeRuntime(
        ctx,
        'POST',
        `/decks/${validated.value.deckId}/hotspots`,
        validated.value,
      ).then((r) => r as Hotspot),
    );
  },
};

export const update_hotspot: McpTool<HotspotUpdateInput, Hotspot> = {
  name: 'update_hotspot',
  description: 'Update an existing hotspot by ID.',
  capability: 'hotspots:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gateOrThrow(ctx, 'hotspots:write');
    const validated = validateHotspotUpdate(input);
    if (!validated.ok) {
      throw new MCPError('INVALID_INPUT', 'invalid input', validated.issues);
    }
    return withAuditTrail(ctx, 'update_hotspot', validated.value, () =>
      callPrototypeRuntime(
        ctx,
        'PATCH',
        `/decks/${validated.value.deckId}/hotspots/${validated.value.hotspotId}`,
        validated.value.patch,
      ).then((r) => r as Hotspot),
    );
  },
};

export const delete_hotspot: McpTool<HotspotDeleteInput, { deleted: boolean }> = {
  name: 'delete_hotspot',
  description: 'Delete a hotspot by ID.',
  capability: 'hotspots:write',
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    required: ['deleted'],
    properties: { deleted: { type: 'boolean' } },
  },
  handler: async (ctx, input) => {
    gateOrThrow(ctx, 'hotspots:write');
    const validated = validateHotspotDelete(input);
    if (!validated.ok) {
      throw new MCPError('INVALID_INPUT', 'invalid input', validated.issues);
    }
    return withAuditTrail(ctx, 'delete_hotspot', validated.value, () =>
      callPrototypeRuntime(
        ctx,
        'DELETE',
        `/decks/${validated.value.deckId}/hotspots/${validated.value.hotspotId}`,
      ).then(() => ({ deleted: true })),
    );
  },
};

export const list_hotspots: McpTool<HotspotListInput, readonly Hotspot[]> = {
  name: 'list_hotspots',
  description: 'List hotspots on a deck (optionally filtered by slide).',
  capability: 'hotspots:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gateOrThrow(ctx, 'hotspots:read');
    const validated = validateHotspotList(input);
    if (!validated.ok) {
      throw new MCPError('INVALID_INPUT', 'invalid input', validated.issues);
    }
    const qs = validated.value.slideId
      ? `?slideId=${encodeURIComponent(validated.value.slideId)}`
      : '';
    return withAuditTrail(ctx, 'list_hotspots', validated.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${validated.value.deckId}/hotspots${qs}`).then((r) =>
        (r as Hotspot[]).slice(),
      ),
    );
  },
};

export const hotspotTools = [
  create_hotspot,
  update_hotspot,
  delete_hotspot,
  list_hotspots,
] as const;
