/**
 * VisibilityPicker — share-dialog tab for picking deck visibility.
 *
 * Per Wave 3 §S3.3 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Options:
 *   - public: anyone with the link can view.
 *   - password: viewers must enter a password before the deck renders.
 *   - domain: viewers must arrive from one of the allow-listed origins.
 *   - sso: viewers must complete SSO before the deck renders.
 *   - email: viewers must supply a verified email before the deck renders.
 *
 * The picker emits `onChange` with a fresh policy blob; the surrounding
 * `ShareDialog` is responsible for persisting via
 * `POST /v1/shares/{id}/policy` once the user saves.
 */

'use client';

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export type VisibilityKind = 'public' | 'password' | 'domain' | 'sso' | 'email';

export interface VisibilityPolicy {
  readonly kind: VisibilityKind;
  readonly password?: string;
  readonly allowedDomains?: readonly string[];
  readonly ssoTenantId?: string;
  readonly ssoRole?: string;
  readonly allowedEmails?: readonly string[];
  readonly expiresAtMs?: number;
}

export interface VisibilityPickerProps {
  readonly value: VisibilityPolicy;
  readonly onChange: (next: VisibilityPolicy) => void;
  readonly dataTestId?: string;
}

const OPTIONS: readonly { kind: VisibilityKind; labelId: string; descriptionId: string }[] = [
  {
    kind: 'public',
    labelId: 'editor.share.visibility.public.label',
    descriptionId: 'editor.share.visibility.public.description',
  },
  {
    kind: 'password',
    labelId: 'editor.share.visibility.password.label',
    descriptionId: 'editor.share.visibility.password.description',
  },
  {
    kind: 'domain',
    labelId: 'editor.share.visibility.domain.label',
    descriptionId: 'editor.share.visibility.domain.description',
  },
  {
    kind: 'sso',
    labelId: 'editor.share.visibility.sso.label',
    descriptionId: 'editor.share.visibility.sso.description',
  },
  {
    kind: 'email',
    labelId: 'editor.share.visibility.email.label',
    descriptionId: 'editor.share.visibility.email.description',
  },
];

export function VisibilityPicker({
  value,
  onChange,
  dataTestId = 'visibility-picker',
}: VisibilityPickerProps): ReactElement {
  const onPick = useCallback(
    (kind: VisibilityKind) => {
      onChange({ ...value, kind });
    },
    [onChange, value],
  );

  return (
    <fieldset data-testid={dataTestId} style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>
        <FormattedMessage id="editor.share.visibility.title" />
      </legend>
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONS.map((opt) => {
          const selected = opt.kind === value.kind;
          return (
            <label
              key={opt.kind}
              data-testid={`${dataTestId}-option-${opt.kind}`}
              data-selected={selected}
              style={{
                display: 'flex',
                gap: 8,
                padding: 12,
                border: `1px solid ${selected ? '#3b82f6' : 'rgba(0,0,0,0.15)'}`,
                borderRadius: 6,
                background: selected ? 'rgba(59,130,246,0.06)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.kind}
                checked={selected}
                onChange={() => onPick(opt.kind)}
                aria-label={opt.labelId}
              />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong>
                  <FormattedMessage id={opt.labelId} />
                </strong>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
                  <FormattedMessage id={opt.descriptionId} />
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {value.kind === 'password' ? (
        <div style={{ marginTop: 12 }}>
          <label
            htmlFor="visibility-password"
            style={{ display: 'block', fontSize: 12, marginBottom: 4 }}
          >
            <FormattedMessage id="editor.share.visibility.password.field" />
          </label>
          <input
            id="visibility-password"
            type="password"
            value={value.password ?? ''}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            data-testid={`${dataTestId}-password`}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid rgba(0,0,0,0.2)',
              borderRadius: 4,
            }}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
