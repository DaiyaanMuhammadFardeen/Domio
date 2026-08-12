/**
 * Custom-domain service stub — Wave 3 §S3.5.
 *
 * The real implementation calls `GET /v1/custom-domains` and friends
 * (see contracts/openapi/v1/marketplace-service.yaml — TBD when the
 * endpoint lands in the marketplace service). Until then we expose
 * deterministic local data so the admin-console UI and tests have
 * something to render.
 */

import type {
  CustomDomain,
  CustomDomainInput,
  CustomDomainList,
  CustomDomainState,
  CustomDomainVerifyResult,
} from './types';

const NOW = Date.UTC(2026, 6, 1);

const SEED: readonly CustomDomain[] = [
  {
    id: 'cd-acme',
    tenant_id: 'acme',
    workspace_id: 'w-acme',
    hostname: 'decks.acme.com',
    state: 'verified',
    cname_target: 'cname.domio.app.',
    last_checked_at_ms: NOW - 1000 * 60 * 30,
    last_check_note: 'CNAME resolves; cert renewed 14 days ago.',
    verified_at_ms: NOW - 1000 * 60 * 60 * 24 * 90,
    label: 'Investor relations',
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 120,
    updated_at_ms: NOW - 1000 * 60 * 60 * 24 * 30,
  },
  {
    id: 'cd-acme-sales',
    tenant_id: 'acme',
    workspace_id: 'w-acme',
    hostname: 'pitch.acme.com',
    state: 'verifying',
    cname_target: 'cname.domio.app.',
    last_checked_at_ms: NOW - 1000 * 60 * 5,
    last_check_note: 'CNAME detected but TTL has not elapsed; will re-check in 30 min.',
    verified_at_ms: null,
    label: 'Sales',
    created_at_ms: NOW - 1000 * 60 * 60 * 24,
    updated_at_ms: NOW - 1000 * 60 * 5,
  },
  {
    id: 'cd-initech',
    tenant_id: 'initech',
    workspace_id: 'w-initech',
    hostname: 'share.initech.io',
    state: 'pending_dns',
    cname_target: 'cname.domio.app.',
    last_checked_at_ms: null,
    last_check_note: null,
    verified_at_ms: null,
    label: null,
    created_at_ms: NOW - 1000 * 60 * 60 * 4,
    updated_at_ms: NOW - 1000 * 60 * 60 * 4,
  },
  {
    id: 'cd-stark',
    tenant_id: 'stark',
    workspace_id: 'w-stark',
    hostname: 'presentations.stark.dev',
    state: 'failed',
    cname_target: 'cname.domio.app.',
    last_checked_at_ms: NOW - 1000 * 60 * 60 * 6,
    last_check_note: 'CNAME found but resolves to 0.0.0.0; check whether registrar stripped the trailing dot.',
    verified_at_ms: null,
    label: 'Internal only',
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 3,
    updated_at_ms: NOW - 1000 * 60 * 60 * 6,
  },
];

export async function listCustomDomains(tenantId?: string): Promise<CustomDomainList> {
  const items = tenantId
    ? SEED.filter((d) => d.tenant_id === tenantId)
    : SEED.slice();
  return { items, total: items.length };
}

export async function getCustomDomain(id: string): Promise<CustomDomain | undefined> {
  return SEED.find((d) => d.id === id);
}

export async function createCustomDomain(input: CustomDomainInput): Promise<CustomDomain> {
  const hostname = input.hostname.trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) {
    throw new Error(`Invalid hostname: ${input.hostname}`);
  }
  const domain: CustomDomain = {
    id: `cd-${Math.random().toString(36).slice(2, 10)}`,
    tenant_id: input.tenant_id,
    workspace_id: input.workspace_id,
    hostname,
    state: 'pending_dns',
    cname_target: 'cname.domio.app.',
    last_checked_at_ms: null,
    last_check_note: null,
    verified_at_ms: null,
    label: input.label ?? null,
    created_at_ms: NOW,
    updated_at_ms: NOW,
  };
  return domain;
}

export async function verifyCustomDomain(id: string): Promise<CustomDomainVerifyResult> {
  const domain = await getCustomDomain(id);
  if (!domain) {
    throw new Error(`Domain ${id} not found`);
  }
  // Pretend verification succeeds only for the verified seed row.
  const cname_ok = domain.state === 'verified' || domain.state === 'verifying';
  const a_record_ok = cname_ok;
  const message = cname_ok
    ? 'CNAME resolves to cname.domio.app.'
    : 'CNAME not detected; add a CNAME record pointing to cname.domio.app.';
  return { domain, cname_ok, a_record_ok, message };
}

export async function revokeCustomDomain(id: string): Promise<CustomDomain> {
  const domain = await getCustomDomain(id);
  if (!domain) {
    throw new Error(`Domain ${id} not found`);
  }
  return {
    ...domain,
    state: 'revoked' as CustomDomainState,
    updated_at_ms: Date.UTC(2026, 6, 1),
  };
}

export const CUSTOM_DOMAIN_STATE_TONES: Readonly<Record<CustomDomainState, 'success' | 'warning' | 'danger' | 'muted'>> = {
  pending_dns: 'warning',
  verifying: 'warning',
  verified: 'success',
  failed: 'danger',
  revoked: 'muted',
};
