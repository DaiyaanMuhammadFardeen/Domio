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

export interface OverlayCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly kind: 'modal' | 'drawer' | 'tooltip' | 'sheet';
  readonly trigger?: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}
export interface OverlayUpdateInput {
  readonly deckId: string;
  readonly overlayId: string;
  readonly patch: Partial<OverlayCreateInput>;
}
export interface OverlayDeleteInput {
  readonly deckId: string;
  readonly overlayId: string;
}
export interface OverlayListInput {
  readonly deckId: string;
}
export interface Overlay {
  readonly id: string;
  readonly kind: OverlayCreateInput['kind'];
  readonly trigger?: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

const KINDS = ['modal', 'drawer', 'tooltip', 'sheet'] as const;

export function validateOverlayCreate(input: unknown): ValidationResult<OverlayCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const content = validateString(o['content'], 'content', issues);
  const kindRaw = o['kind'];
  if (typeof kindRaw !== 'string' || !KINDS.includes(kindRaw as (typeof KINDS)[number])) {
    issues.push(`kind must be one of ${KINDS.join(', ')}`);
  }
  if (issues.length > 0 || !deckId || !content) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const kind = kindRaw as OverlayCreateInput['kind'];
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  const trigger = typeof o['trigger'] === 'string' ? o['trigger'] : undefined;
  const metadata =
    o['metadata'] && typeof o['metadata'] === 'object' && !Array.isArray(o['metadata'])
      ? (o['metadata'] as Record<string, unknown>)
      : undefined;
  let value: OverlayCreateInput;
  if (id) {
    if (trigger) {
      value = metadata
        ? { deckId, id, kind, trigger, content, metadata }
        : { deckId, id, kind, trigger, content };
    } else {
      value = { deckId, id, kind, content };
    }
  } else {
    value = { deckId, kind, content };
  }
  return { ok: true, value };
}

function validateOverlayUpdate(input: unknown): ValidationResult<OverlayUpdateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const overlayId = validateString(o['overlayId'], 'overlayId', issues);
  const patchObj = validateObject(o['patch'], 'patch', issues);
  if (!deckId || !overlayId || !patchObj) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, overlayId, patch: patchObj as Partial<OverlayCreateInput> } };
}

function validateOverlayDelete(input: unknown): ValidationResult<OverlayDeleteInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const overlayId = validateString(o['overlayId'], 'overlayId', issues);
  if (!deckId || !overlayId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, overlayId } };
}

function validateOverlayList(input: unknown): ValidationResult<OverlayListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
}

function gate(ctx: McpContext, cap: 'overlays:read' | 'overlays:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_overlay: McpTool<OverlayCreateInput, Overlay> = {
  name: 'create_overlay',
  description: 'Create an overlay (modal/drawer/tooltip/sheet).',
  capability: 'overlays:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'overlays:write');
    const v = validateOverlayCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_overlay', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/overlays`, v.value).then(
        (r) => r as Overlay,
      ),
    );
  },
};

export const update_overlay: McpTool<OverlayUpdateInput, Overlay> = {
  name: 'update_overlay',
  description: 'Update an overlay.',
  capability: 'overlays:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'overlays:write');
    const v = validateOverlayUpdate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'update_overlay', v.value, () =>
      callPrototypeRuntime(
        ctx,
        'PATCH',
        `/decks/${v.value.deckId}/overlays/${v.value.overlayId}`,
        v.value.patch,
      ).then((r) => r as Overlay),
    );
  },
};

export const delete_overlay: McpTool<OverlayDeleteInput, { deleted: boolean }> = {
  name: 'delete_overlay',
  description: 'Delete an overlay.',
  capability: 'overlays:write',
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    properties: { deleted: { type: 'boolean' } },
  },
  handler: async (ctx, input) => {
    gate(ctx, 'overlays:write');
    const v = validateOverlayDelete(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'delete_overlay', v.value, () =>
      callPrototypeRuntime(ctx, 'DELETE', `/decks/${v.value.deckId}/overlays/${v.value.overlayId}`).then(
        () => ({ deleted: true }),
      ),
    );
  },
};

export const list_overlays: McpTool<OverlayListInput, readonly Overlay[]> = {
  name: 'list_overlays',
  description: 'List overlays on a deck.',
  capability: 'overlays:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'overlays:read');
    const v = validateOverlayList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_overlays', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/overlays`).then(
        (r) => (r as Overlay[]).slice(),
      ),
    );
  },
};

export const overlayTools = [create_overlay, update_overlay, delete_overlay, list_overlays] as const;