/**
 * SSOConfig — share-dialog control for SAML / OIDC SSO gating.
 *
 * Per Wave 3 §S3.3 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Lets the workspace admin scope the share link to a specific SSO
 * tenant + role. The bootstrap implementation lets the user pick
 * from a list of known tenants and enter a role; the real backend
 * will resolve `tenantId` → IdP metadata and surface a redirect URL.
 */

'use client';

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface SSOTenant {
  readonly tenantId: string;
  readonly displayName: string;
  readonly provider: 'okta' | 'azure-ad' | 'google' | 'onelogin' | 'custom';
}

export interface SSOConfigValue {
  readonly tenantId?: string;
  readonly role?: string;
}

export interface SSOConfigProps {
  readonly tenants: readonly SSOTenant[];
  readonly value: SSOConfigValue;
  readonly onChange: (next: SSOConfigValue) => void;
  readonly dataTestId?: string;
}

export function SSOConfig({ tenants, value, onChange, dataTestId = 'sso-config' }: SSOConfigProps): ReactElement {
  const onTenant = useCallback(
    (tenantId: string) => {
      onChange({ ...value, tenantId });
    },
    [onChange, value],
  );
  const onRole = useCallback(
    (role: string) => {
      onChange({ ...value, role });
    },
    [onChange, value],
  );

  return (
    <div data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontWeight: 600 }}>
        <FormattedMessage id="editor.share.sso.title" />
      </label>
      <select
        value={value.tenantId ?? ''}
        onChange={(e) => onTenant(e.target.value)}
        data-testid={`${dataTestId}-tenant`}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
      >
        <option value="">—</option>
        {tenants.map((t) => (
          <option key={t.tenantId} value={t.tenantId}>
            {t.displayName} · {t.provider}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value.role ?? ''}
        onChange={(e) => onRole(e.target.value)}
        placeholder="viewer-role"
        data-testid={`${dataTestId}-role`}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
      />
      {value.tenantId ? (
        <div data-testid={`${dataTestId}-redirect`} style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
          <FormattedMessage id="editor.share.sso.redirectHint" />
        </div>
      ) : null}
    </div>
  );
}