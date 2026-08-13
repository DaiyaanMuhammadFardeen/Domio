/**
 * API key service — Wave 8 §S8.8.
 *
 * In-memory deterministic seed used by the admin-console UI and tests
 * until the platform-api exposes real `/v1/api-keys` endpoints. Mirrors
 * the custom-domain-service / scim-service pattern: resilient fetch
 * with seed fallback so the page renders whether or not the upstream
 * is reachable.
 */

import { fetcher } from './fetcher';
import type {
  APIKey,
  APIKeyCreateResult,
  APIKeyInput,
  APIKeyScope,
} from './types';

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

const SEED: readonly APIKey[] = [
  {
    id: 'apikey-acme-ci',
    tenant_id: 'acme',
    name: 'CI deploy bot',
    scopes: ['read-write'],
    prefix: 'dapi_ac7x',
    created_at_ms: NOW - 90 * DAY_MS,
    created_by: 'user-acme-1',
    last_used_at_ms: NOW - 1000 * 60 * 12,
    expires_at_ms: NOW + 275 * DAY_MS,
    revoked: false,
  },
  {
    id: 'apikey-acme-export',
    tenant_id: 'acme',
    name: 'Quarterly export pipeline',
    scopes: ['export', 'read-only'],
    prefix: 'dapi_expt',
    created_at_ms: NOW - 30 * DAY_MS,
    created_by: 'user-acme-1',
    last_used_at_ms: NOW - 1000 * 60 * 60 * 24 * 2,
    expires_at_ms: NOW + 335 * DAY_MS,
    revoked: false,
  },
  {
    id: 'apikey-initech-agent',
    tenant_id: 'initech',
    name: 'Agent runtime key',
    scopes: ['agent-only'],
    prefix: 'dapi_age1',
    created_at_ms: NOW - 14 * DAY_MS,
    created_by: 'user-initech-1',
    last_used_at_ms: NOW - 1000 * 60 * 3,
    expires_at_ms: NOW + 90 * DAY_MS,
    revoked: false,
  },
  {
    id: 'apikey-acme-revoked',
    tenant_id: 'acme',
    name: 'Legacy ETL key',
    scopes: ['read-write', 'admin'],
    prefix: 'dapi_leg9',
    created_at_ms: NOW - 365 * DAY_MS,
    created_by: 'user-acme-2',
    last_used_at_ms: NOW - 60 * DAY_MS,
    expires_at_ms: NOW - 5 * DAY_MS,
    revoked: true,
  },
];

// Mutable working copy that gets reset between test runs.
const STORE: APIKey[] = SEED.map((k) => ({
  ...k,
  scopes: k.scopes.slice(),
}));

function clone(k: APIKey): APIKey {
  return { ...k, scopes: k.scopes.slice() };
}

function genId(): string {
  return `apikey-${Math.random().toString(36).slice(2, 10)}`;
}

function generateSecret(): string {
  // 32 lowercase-alphanumerics after the underscore; the prefix carries
  // the readable part. Tests rely on `length === 32` for the secret
  // portion, randomness is fine because vitest resets module state.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx] ?? '0';
  }
  return out;
}

/**
 * List API keys. By default revoked keys are excluded so the admin
 * console only shows actionable rows. Pass `{ includeRevoked: true }`
 * to retrieve every key (used by the audit log).
 */
export async function listAPIKeys(
  opts: { readonly includeRevoked?: boolean; readonly tenantId?: string } = {},
): Promise<ReadonlyArray<APIKey>> {
  try {
    const params = new URLSearchParams();
    if (opts.tenantId) params.set('tenant_id', opts.tenantId);
    if (opts.includeRevoked) params.set('include_revoked', 'true');
    const qs = params.toString();
    const json = await fetcher<{ items?: APIKey[] }>(
      `/v1/admin/api-keys${qs.length > 0 ? `?${qs}` : ''}`,
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  let items = STORE.map(clone);
  if (!opts.includeRevoked) {
    items = items.filter((k) => !k.revoked);
  }
  if (opts.tenantId) {
    items = items.filter((k) => k.tenant_id === opts.tenantId);
  }
  return items;
}

export async function getAPIKey(id: string): Promise<APIKey | undefined> {
  try {
    return await fetcher<APIKey>(
      `/v1/admin/api-keys/${encodeURIComponent(id)}`,
    );
  } catch {
    const found = STORE.find((k) => k.id === id);
    return found ? clone(found) : undefined;
  }
}

/**
 * Mint a new API key. The full secret is returned exactly once — the
 * caller must surface it to the user immediately, after which only
 * the prefix is recoverable.
 */
export async function createAPIKey(input: APIKeyInput): Promise<APIKeyCreateResult> {
  if (!input.name.trim()) {
    throw new Error('API key name is required');
  }
  if (input.scopes.length === 0) {
    throw new Error('At least one scope is required');
  }
  const validScopes: ReadonlyArray<APIKeyScope> = [
    'read-only',
    'read-write',
    'agent-only',
    'admin',
    'export',
  ];
  for (const s of input.scopes) {
    if (!validScopes.includes(s)) {
      throw new Error(`Unknown scope: ${s}`);
    }
  }
  const id = genId();
  const prefixSuffix = Math.random().toString(36).slice(2, 6);
  const prefix = `dapi_${prefixSuffix}`;
  const secret = generateSecret();
  const key: APIKey = {
    id,
    tenant_id: 'acme',
    name: input.name.trim(),
    scopes: input.scopes.slice(),
    prefix,
    created_at_ms: NOW,
    created_by: 'user-acme-1',
    last_used_at_ms: null,
    expires_at_ms: input.expires_at_ms ?? null,
    revoked: false,
  };
  STORE.push(key);
  try {
    return await fetcher<APIKeyCreateResult>('/v1/admin/api-keys', {
      method: 'POST',
      body: input,
    });
  } catch {
    return { key, secret };
  }
}

export async function revokeAPIKey(id: string): Promise<APIKey> {
  const idx = STORE.findIndex((k) => k.id === id);
  if (idx < 0) {
    throw new Error(`API key ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`API key ${id} not found`);
  }
  const next: APIKey = { ...prev, revoked: true };
  STORE[idx] = next;
  try {
    return await fetcher<APIKey>(
      `/v1/admin/api-keys/${encodeURIComponent(id)}/revoke`,
      { method: 'POST' },
    );
  } catch {
    return clone(next);
  }
}

export const API_KEY_SCOPES: ReadonlyArray<APIKeyScope> = [
  'read-only',
  'read-write',
  'agent-only',
  'admin',
  'export',
];
