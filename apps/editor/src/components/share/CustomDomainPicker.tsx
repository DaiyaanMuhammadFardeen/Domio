/**
 * CustomDomainPicker — share-dialog picker for per-tenant viewer hostnames.
 *
 * Per Wave 3 §S3.5 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Surfaces the verified custom domains registered for the deck's tenant
 * so editors can rewrite the share link to a branded hostname. The
 * default `deck.domio.app` is always available as the fallback.
 *
 * State is owned by the parent (`ShareDialog`) — this component is a
 * controlled picker.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface CustomDomainOption {
  /** Fully-qualified hostname, e.g. `decks.acme.com`. */
  readonly hostname: string;
  /** `true` only when the CNAME is verified and SSL is provisioned. */
  readonly verified: boolean;
  /** Optional human-readable label, e.g. `Investor relations`. */
  readonly label?: string;
}

export interface CustomDomainPickerProps {
  /** Domains available for this tenant (subset of admin-console data). */
  readonly options: readonly CustomDomainOption[];
  /** Currently-selected hostname, or `undefined` for the default. */
  readonly value: string | undefined;
  readonly onChange: (hostname: string | undefined) => void;
  readonly dataTestId?: string;
}

const DEFAULT_HOST = 'deck.domio.app';

export function CustomDomainPicker({
  options,
  value,
  onChange,
  dataTestId = 'custom-domain-picker',
}: CustomDomainPickerProps): ReactElement {
  const verifiedOptions = useMemo(() => options.filter((o) => o.verified), [options]);

  const onSelect = useCallback(
    (hostname: string | undefined) => {
      if (hostname === DEFAULT_HOST) onChange(undefined);
      else onChange(hostname);
    },
    [onChange],
  );

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header>
        <strong>
          <FormattedMessage id="editor.share.customDomain.title" />
        </strong>
      </header>
      <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: 0 }}>
        <FormattedMessage id="editor.share.customDomain.help" />
      </p>
      <ul
        data-testid={`${dataTestId}-list`}
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <li>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name="custom-domain"
              checked={value === undefined}
              onChange={() => onSelect(undefined)}
              data-testid={`${dataTestId}-default`}
            />
            <code style={{ fontSize: 12 }}>{DEFAULT_HOST}</code>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
              <FormattedMessage id="editor.share.customDomain.default" />
            </span>
          </label>
        </li>
        {verifiedOptions.length === 0 ? (
          <li style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
            <FormattedMessage id="editor.share.customDomain.empty" />
          </li>
        ) : (
          verifiedOptions.map((opt) => {
            const checked = value === opt.hostname;
            return (
              <li key={opt.hostname} data-testid={`${dataTestId}-option-${opt.hostname}`}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="custom-domain"
                    checked={checked}
                    onChange={() => onSelect(opt.hostname)}
                    data-testid={`${dataTestId}-check-${opt.hostname}`}
                  />
                  <code style={{ fontSize: 12 }}>{opt.hostname}</code>
                  {opt.label ? (
                    <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>· {opt.label}</span>
                  ) : null}
                </label>
              </li>
            );
          })
        )}
      </ul>
      {options.some((o) => !o.verified) ? (
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', margin: 0 }}>
          <FormattedMessage id="editor.share.customDomain.unverifiedHint" />
        </p>
      ) : null}
    </section>
  );
}

export const DEFAULT_CUSTOM_DOMAIN_HOST = DEFAULT_HOST;
