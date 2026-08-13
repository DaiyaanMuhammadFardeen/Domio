/**
 * VersionPinSelector — share-dialog "Versions" tab for version pinning.
 *
 * Per Wave 3 §S3.11 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Each share link can be pinned to a specific deck version or set to
 * follow the latest. The selector enumerates available versions
 * (typically the published history from the version-pin service) and
 * emits `PATCH /v1/shares/{id}` with `{ pinVersion: 'v' | 'latest' }`.
 *
 * Persistence is the parent's concern — this component is purely a
 * controlled picker.
 */

'use client';

import { useCallback, useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface DeckVersion {
  /** Stable identifier, e.g. `1.4.0` or `2026-07-01T12:00Z`. */
  readonly id: string;
  /** Human-readable label shown in the select. */
  readonly label: string;
  readonly createdAtMs: number;
  readonly authorLabel: string;
  readonly isLatest: boolean;
}

export type PinVersionValue = 'latest' | DeckVersion['id'];

export interface VersionPinSelectorProps {
  readonly versions: readonly DeckVersion[];
  readonly value: PinVersionValue;
  readonly onChange: (next: PinVersionValue) => void;
  readonly dataTestId?: string;
}

export function VersionPinSelector({
  versions,
  value,
  onChange,
  dataTestId = 'version-pin-selector',
}: VersionPinSelectorProps): ReactElement {
  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.createdAtMs - a.createdAtMs),
    [versions],
  );

  const onSelect = useCallback(
    (next: string) => {
      onChange(next === 'latest' ? 'latest' : next);
    },
    [onChange],
  );

  const selectedId = value === 'latest' ? 'latest' : value;

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header>
        <strong>
          <FormattedMessage id="editor.share.versionPin.title" />
        </strong>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: '4px 0 0' }}>
          <FormattedMessage id="editor.share.versionPin.help" />
        </p>
      </header>
      <label style={{ fontSize: 12 }}>
        <FormattedMessage id="editor.share.versionPin.label" />
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          data-testid={`${dataTestId}-select`}
          style={{ display: 'block', width: '100%', padding: 6, marginTop: 2 }}
        >
          <option value="latest">{`(Latest)`}</option>
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label} {v.isLatest ? '· latest' : ''} — {v.authorLabel}
            </option>
          ))}
        </select>
      </label>
      {value === 'latest' ? (
        <p
          data-testid={`${dataTestId}-latest-hint`}
          style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', margin: 0 }}
        >
          <FormattedMessage id="editor.share.versionPin.latestHint" />
        </p>
      ) : (
        <p
          data-testid={`${dataTestId}-pinned-hint`}
          style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', margin: 0 }}
        >
          <FormattedMessage id="editor.share.versionPin.pinnedHint" values={{ version: value }} />
        </p>
      )}
    </section>
  );
}
