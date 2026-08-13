/**
 * DomainAllowlist — share-dialog control for restricting share links by origin.
 *
 * Per Wave 3 §S3.3 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Receives a list of currently allow-listed domains; each row is a
 * domain (e.g. `acme.com`). The control surfaces add / remove +
 * save-state. Emits `onChange` with the next list.
 */

'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface DomainAllowlistProps {
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly dataTestId?: string;
}

export function DomainAllowlist({
  value,
  onChange,
  dataTestId = 'domain-allowlist',
}: DomainAllowlistProps): ReactElement {
  const [draft, setDraft] = useState('');

  const onAdd = useCallback(() => {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  }, [draft, onChange, value]);

  const onRemove = useCallback(
    (domain: string) => {
      onChange(value.filter((d) => d !== domain));
    },
    [onChange, value],
  );

  return (
    <div data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontWeight: 600 }}>
        <FormattedMessage id="editor.share.domainAllowlist.title" />
      </label>
      <textarea
        aria-label="domain-list-editor"
        value={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/\n+/)
              .map((d) => d.trim())
              .filter(Boolean),
          )
        }
        rows={Math.max(3, value.length + 1)}
        data-testid={`${dataTestId}-textarea`}
        style={{
          padding: '6px 8px',
          fontFamily: 'monospace',
          fontSize: 12,
          border: '1px solid rgba(0,0,0,0.2)',
          borderRadius: 4,
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="example.com"
          data-testid={`${dataTestId}-draft`}
          style={{
            flex: 1,
            padding: '6px 8px',
            border: '1px solid rgba(0,0,0,0.2)',
            borderRadius: 4,
          }}
        />
        <button
          type="button"
          onClick={onAdd}
          data-testid={`${dataTestId}-add`}
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            border: 'none',
            background: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <FormattedMessage id="editor.share.domainAllowlist.add" />
        </button>
      </div>
      <ul
        data-testid={`${dataTestId}-list`}
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {value.map((d) => (
          <li
            key={d}
            data-testid={`${dataTestId}-item-${d}`}
            style={{
              padding: '4px 8px',
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <span>{d}</span>
            <button
              type="button"
              onClick={() => onRemove(d)}
              aria-label={`remove ${d}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#dc2626',
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
