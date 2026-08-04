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

export interface DeviceFrameCreateInput {
  readonly deckId: string;
  readonly id?: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly notch?: { x: number; y: number; w: number; h: number };
  readonly safeArea?: { top: number; right: number; bottom: number; left: number };
}
export interface DeviceFrameListInput {
  readonly deckId: string;
}
export interface DeviceFrame {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

function validateCreate(input: unknown): ValidationResult<DeviceFrameCreateInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const name = validateString(o['name'], 'name', issues);
  const width = validateNumber(o['width'], 'width', issues);
  const height = validateNumber(o['height'], 'height', issues);
  if (!deckId || !name || width === null || height === null) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  const id = typeof o['id'] === 'string' ? o['id'] : undefined;
  let value: DeviceFrameCreateInput;
  const base: Omit<DeviceFrameCreateInput, 'notch' | 'safeArea'> = id
    ? { deckId, id, name, width, height }
    : { deckId, name, width, height };
  let notch: DeviceFrameCreateInput['notch'];
  let safeArea: DeviceFrameCreateInput['safeArea'];
  if (o['notch'] && typeof o['notch'] === 'object') {
    const n = o['notch'] as Record<string, unknown>;
    const x = n['x'];
    const y = n['y'];
    const w = n['w'];
    const h = n['h'];
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof w === 'number' &&
      typeof h === 'number'
    ) {
      notch = { x, y, w, h };
    }
  }
  if (o['safeArea'] && typeof o['safeArea'] === 'object') {
    const s = o['safeArea'] as Record<string, unknown>;
    if (
      typeof s['top'] === 'number' &&
      typeof s['right'] === 'number' &&
      typeof s['bottom'] === 'number' &&
      typeof s['left'] === 'number'
    ) {
      safeArea = { top: s['top'], right: s['right'], bottom: s['bottom'], left: s['left'] };
    }
  }
  if (notch && safeArea) value = { ...base, notch, safeArea };
  else if (notch) value = { ...base, notch };
  else if (safeArea) value = { ...base, safeArea };
  else value = base;
  return { ok: true, value };
}

function validateList(input: unknown): ValidationResult<DeviceFrameListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
  void validateObject;
}

function gate(ctx: McpContext, cap: 'device-frames:read' | 'device-frames:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const create_device_frame: McpTool<DeviceFrameCreateInput, DeviceFrame> = {
  name: 'create_device_frame',
  description: 'Create a device frame.',
  capability: 'device-frames:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'device-frames:write');
    const v = validateCreate(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'create_device_frame', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/device-frames`, v.value).then(
        (r) => r as DeviceFrame,
      ),
    );
  },
};

export const list_device_frames: McpTool<DeviceFrameListInput, readonly DeviceFrame[]> = {
  name: 'list_device_frames',
  description: 'List device frames.',
  capability: 'device-frames:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'device-frames:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_device_frames', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/device-frames`).then(
        (r) => (r as DeviceFrame[]).slice(),
      ),
    );
  },
};

export const deviceFrameTools = [create_device_frame, list_device_frames] as const;