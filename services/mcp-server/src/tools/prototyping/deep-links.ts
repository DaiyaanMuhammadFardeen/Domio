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

export interface DeepLinkShortenInput {
  readonly deckId: string;
  readonly target: string;
  readonly params?: Record<string, string>;
}
export interface DeepLinkResolveInput {
  readonly deckId: string;
  readonly slug: string;
}
export interface DeepLinkListInput {
  readonly deckId: string;
}
export interface DeepLink {
  readonly slug: string;
  readonly target: string;
  readonly params?: Record<string, string>;
}

function validateShorten(input: unknown): ValidationResult<DeepLinkShortenInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const target = validateString(o['target'], 'target', issues);
  if (!deckId || !target) return { ok: false, code: 'INVALID_INPUT', issues };
  const params =
    o['params'] && typeof o['params'] === 'object' && !Array.isArray(o['params'])
      ? (o['params'] as Record<string, string>)
      : undefined;
  const value: DeepLinkShortenInput = params ? { deckId, target, params } : { deckId, target };
  return { ok: true, value };
}

function validateResolve(input: unknown): ValidationResult<DeepLinkResolveInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const slug = validateString(o['slug'], 'slug', issues);
  if (!deckId || !slug) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId, slug } };
}

function validateList(input: unknown): ValidationResult<DeepLinkListInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const deckId = validateString((input as Record<string, unknown>)['deckId'], 'deckId', issues);
  if (!deckId) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckId } };
  void validateObject;
}

function gate(ctx: McpContext, cap: 'deep-links:read' | 'deep-links:write') {
  const r = claimCapability(ctx.agentId, cap);
  if (!r.granted) throw new MCPError('PERMISSION_DENIED', r.reason ?? 'permission denied');
}

export const shorten_deep_link: McpTool<DeepLinkShortenInput, DeepLink> = {
  name: 'shorten_deep_link',
  description: 'Create a shortened deep link that targets a deck path.',
  capability: 'deep-links:write',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'deep-links:write');
    const v = validateShorten(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'shorten_deep_link', v.value, () =>
      callPrototypeRuntime(ctx, 'POST', `/decks/${v.value.deckId}/deep-links`, v.value).then(
        (r) => r as DeepLink,
      ),
    );
  },
};

export const resolve_deep_link: McpTool<DeepLinkResolveInput, DeepLink> = {
  name: 'resolve_deep_link',
  description: 'Resolve a deep-link slug to its target.',
  capability: 'deep-links:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    gate(ctx, 'deep-links:read');
    const v = validateResolve(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'resolve_deep_link', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/deep-links/${v.value.slug}`).then(
        (r) => r as DeepLink,
      ),
    );
  },
};

export const list_deep_links: McpTool<DeepLinkListInput, readonly DeepLink[]> = {
  name: 'list_deep_links',
  description: 'List deep links on a deck.',
  capability: 'deep-links:read',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'array', items: { type: 'object' } },
  handler: async (ctx, input) => {
    gate(ctx, 'deep-links:read');
    const v = validateList(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'list_deep_links', v.value, () =>
      callPrototypeRuntime(ctx, 'GET', `/decks/${v.value.deckId}/deep-links`).then((r) =>
        (r as DeepLink[]).slice(),
      ),
    );
  },
};

export const deepLinkTools = [shorten_deep_link, resolve_deep_link, list_deep_links] as const;
