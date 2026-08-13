/**
 * SSO service stub — Wave 8 §S8.1.
 *
 * The real implementation calls `GET /v1/admin/sso/providers` and
 * friends (see contracts/openapi/v1/admin-service.yaml — TBD when the
 * endpoint lands). Until then we expose deterministic local data so the
 * admin-console UI and tests have something to render.
 *
 * Falls back to the local seed if the upstream call throws, mirroring
 * the custom-domain-service pattern.
 */

import { fetcher } from './fetcher';
import type {
  SSOProvider,
  SSOProtocol,
  SSOProviderStatus,
  SSORoleMapping,
  SSOTestLoginRequest,
  SSOTestLoginResult,
} from './types';

const NOW = Date.UTC(2026, 6, 1);

const ROLE_MAPPING_OKTA: ReadonlyArray<SSORoleMapping> = [
  { sso_role: 'domio-admin', domio_role: 'admin' },
  { sso_role: 'domio-editor', domio_role: 'editor' },
  { sso_role: 'domio-viewer', domio_role: 'viewer' },
];

const ROLE_MAPPING_AZURE: ReadonlyArray<SSORoleMapping> = [
  { sso_role: 'Owner', domio_role: 'admin' },
  { sso_role: 'Contributor', domio_role: 'editor' },
  { sso_role: 'Reader', domio_role: 'viewer' },
];

const ROLE_MAPPING_GOOGLE: ReadonlyArray<SSORoleMapping> = [
  { sso_role: 'admin@acme.com', domio_role: 'admin' },
  { sso_role: 'editor@acme.com', domio_role: 'editor' },
];

const ROLE_MAPPING_GITHUB: ReadonlyArray<SSORoleMapping> = [
  { sso_role: 'org:admin', domio_role: 'admin' },
  { sso_role: 'org:member', domio_role: 'editor' },
];

const SEED: readonly SSOProvider[] = [
  {
    id: 'sso-okta-acme',
    tenant_id: 'acme',
    name: 'Okta',
    protocol: 'saml',
    metadata_url: 'https://acme.okta.com/app/domio/exk1.../sso/saml/metadata',
    entity_id: 'urn:domio:acme:saml:okta',
    acs_url: 'https://api.domio.app/v1/sso/saml/acme/acs',
    role_mapping: ROLE_MAPPING_OKTA,
    status: 'connected',
    last_sync_at_ms: NOW - 1000 * 60 * 12,
    error_count_24h: 0,
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 180,
  },
  {
    id: 'sso-azure-initech',
    tenant_id: 'initech',
    name: 'Azure AD',
    protocol: 'saml',
    metadata_url:
      'https://login.microsoftonline.com/initech.onmicrosoft.com/federationmetadata/2007-06/federationmetadata.xml',
    entity_id: 'urn:domio:initech:saml:azure',
    acs_url: 'https://api.domio.app/v1/sso/saml/initech/acs',
    role_mapping: ROLE_MAPPING_AZURE,
    status: 'connected',
    last_sync_at_ms: NOW - 1000 * 60 * 45,
    error_count_24h: 2,
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 60,
  },
  {
    id: 'sso-google-acme',
    tenant_id: 'acme',
    name: 'Google Workspace',
    protocol: 'oidc',
    metadata_url: null,
    entity_id: 'urn:domio:acme:oidc:google',
    acs_url: 'https://api.domio.app/v1/sso/oidc/acme/callback',
    role_mapping: ROLE_MAPPING_GOOGLE,
    status: 'connected',
    last_sync_at_ms: NOW - 1000 * 60 * 90,
    error_count_24h: 0,
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 30,
  },
  {
    id: 'sso-github-stark',
    tenant_id: 'stark',
    name: 'GitHub',
    protocol: 'oidc',
    metadata_url: null,
    entity_id: 'urn:domio:stark:oidc:github',
    acs_url: 'https://api.domio.app/v1/sso/oidc/stark/callback',
    role_mapping: ROLE_MAPPING_GITHUB,
    status: 'connected',
    last_sync_at_ms: NOW - 1000 * 60 * 60 * 2,
    error_count_24h: 0,
    created_at_ms: NOW - 1000 * 60 * 60 * 24 * 14,
  },
];

export async function listSSOProviders(
  tenantId?: string,
): Promise<ReadonlyArray<SSOProvider>> {
  try {
    const params = tenantId
      ? `?tenant_id=${encodeURIComponent(tenantId)}`
      : '';
    const json = await fetcher<{ items?: SSOProvider[] }>(
      `/v1/admin/sso/providers${params}`,
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  return tenantId ? SEED.filter((p) => p.tenant_id === tenantId) : SEED.slice();
}

export async function getSSOProvider(
  id: string,
): Promise<SSOProvider | undefined> {
  try {
    return await fetcher<SSOProvider>(`/v1/admin/sso/providers/${encodeURIComponent(id)}`);
  } catch {
    return SEED.find((p) => p.id === id);
  }
}

export interface CreateSSOProviderInput {
  readonly tenant_id: string;
  readonly name: string;
  readonly protocol: SSOProtocol;
  readonly metadata_url?: string | null;
  readonly role_mapping?: ReadonlyArray<SSORoleMapping>;
}

export async function createSSOProvider(
  input: CreateSSOProviderInput,
): Promise<SSOProvider> {
  const id = `sso-${Math.random().toString(36).slice(2, 10)}`;
  const provider: SSOProvider = {
    id,
    tenant_id: input.tenant_id,
    name: input.name.trim(),
    protocol: input.protocol,
    metadata_url: input.metadata_url ?? null,
    entity_id: `urn:domio:${input.tenant_id}:${input.protocol}:${id}`,
    acs_url: `https://api.domio.app/v1/sso/${input.protocol}/${input.tenant_id}/${
      input.protocol === 'saml' ? 'acs' : 'callback'
    }`,
    role_mapping: input.role_mapping ?? [],
    status: 'pending',
    last_sync_at_ms: null,
    error_count_24h: 0,
    created_at_ms: Date.UTC(2026, 6, 1),
  };
  try {
    return await fetcher<SSOProvider>('/v1/admin/sso/providers', {
      method: 'POST',
      body: input,
    });
  } catch {
    return provider;
  }
}

export async function deleteSSOProvider(id: string): Promise<void> {
  try {
    await fetcher<void>(`/v1/admin/sso/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    // swallow — seed providers can't be deleted
  }
}

export async function testSSOLogin(
  req: SSOTestLoginRequest,
): Promise<SSOTestLoginResult> {
  const start = Date.now();
  try {
    return await fetcher<SSOTestLoginResult>(
      `/v1/admin/sso/providers/${encodeURIComponent(req.provider_id)}/test-login`,
      {
        method: 'POST',
        body: { subject_email: req.subject_email },
      },
    );
  } catch {
    // simulate round-trip
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    const latency = Date.now() - start;
    const provider = SEED.find((p) => p.id === req.provider_id);
    if (!provider) {
      return {
        ok: false,
        resolved_subject: null,
        resolved_roles: [],
        latency_ms: latency,
        error: `Provider ${req.provider_id} not found`,
      };
    }
    const subject = req.subject_email.trim();
    const roleNames = provider.role_mapping.map((r) => r.domio_role);
    return {
      ok: true,
      resolved_subject: subject,
      resolved_roles: roleNames,
      latency_ms: latency,
      error: null,
    };
  }
}

export const SSO_PROVIDER_STATUS_TONES: Readonly<
  Record<SSOProviderStatus, 'success' | 'warning' | 'danger' | 'muted'>
> = {
  connected: 'success',
  degraded: 'warning',
  disconnected: 'danger',
  pending: 'muted',
};
