/**
 * SCIM service stub — Wave 8 §S8.1.
 *
 * Wraps `GET /v1/admin/scim/tokens`, `POST …/tokens`, and
 * `DELETE …/tokens/:id`. The token secret is returned only once, at
 * creation time. Falls back to deterministic local seed when the
 * upstream is unreachable, mirroring custom-domain-service.
 */

import { fetcher } from './fetcher';
import type { SCIMToken, SCIMTokenCreateResult } from './types';

const NOW = Date.UTC(2026, 6, 1);

const SEED: readonly SCIMToken[] = [
  {
    id: 'scim-acme-001',
    tenant_id: 'acme',
    endpoint_url: 'https://api.domio.app/scim/v2/acme',
    token_prefix: 'dmao_ac7',
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 30,
    last_used_at_ms: NOW - 1000 * 60 * 5,
    expires_at_ms: NOW + 1000 * 60 * 60 * 24 * 365,
  },
  {
    id: 'scim-initech-001',
    tenant_id: 'initech',
    endpoint_url: 'https://api.domio.app/scim/v2/initech',
    token_prefix: 'dmin_3b1',
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 14,
    last_used_at_ms: NOW - 1000 * 60 * 60 * 6,
    expires_at_ms: NOW + 1000 * 60 * 60 * 24 * 365,
  },
];

export async function listSCIMTokens(
  tenantId?: string,
): Promise<ReadonlyArray<SCIMToken>> {
  try {
    const params = tenantId
      ? `?tenant_id=${encodeURIComponent(tenantId)}`
      : '';
    const json = await fetcher<{ items?: SCIMToken[] }>(
      `/v1/admin/scim/tokens${params}`,
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through
  }
  return tenantId ? SEED.filter((t) => t.tenant_id === tenantId) : SEED.slice();
}

export interface CreateSCIMTokenInput {
  readonly tenant_id: string;
  readonly expires_in_days?: number | null;
}

function generateSecret(prefix: string): string {
  // 48 char deterministic-ish suffix. Tests rely on the secret being
  // long; randomness here is fine because vitest resets per test.
  let suffix = '';
  for (let i = 0; i < 48; i += 1) {
    const ch = Math.floor(Math.random() * 36);
    suffix += ch < 10 ? String(ch) : String.fromCharCode(97 + ch - 10);
  }
  return `${prefix}_${suffix}`;
}

export async function createSCIMToken(
  input: CreateSCIMTokenInput,
): Promise<SCIMTokenCreateResult> {
  const prefix = `dm${input.tenant_id.slice(0, 4)}o_`;
  const secret = generateSecret(prefix);
  const id = `scim-${input.tenant_id}-${Math.random().toString(36).slice(2, 6)}`;
  const token: SCIMToken = {
    id,
    tenant_id: input.tenant_id,
    endpoint_url: `https://api.domio.app/scim/v2/${input.tenant_id}`,
    token_prefix: secret.slice(0, 8),
    created_at_ms: NOW,
    last_used_at_ms: null,
    expires_at_ms:
      input.expires_in_days && input.expires_in_days > 0
        ? NOW + input.expires_in_days * 1000 * 60 * 60 * 24
        : null,
  };
  try {
    return await fetcher<SCIMTokenCreateResult>('/v1/admin/scim/tokens', {
      method: 'POST',
      body: input,
    });
  } catch {
    return { token, token_secret: secret };
  }
}

export async function revokeSCIMToken(id: string): Promise<void> {
  try {
    await fetcher<void>(`/v1/admin/scim/tokens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    // swallow — seed tokens can't be deleted
  }
}