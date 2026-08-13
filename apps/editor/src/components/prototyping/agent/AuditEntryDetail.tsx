'use client';

/**
 * AuditEntryDetail — pretty-printed request + response viewer for a
 * single tool-call audit entry.
 *
 * Per Wave 10 §S10.9 of docs/frontend-roadmap/10-wave-agentic-programmable.md.
 * Each section (request, response) is collapsible so users can skim the
 * list while keeping the expanded detail uncluttered.
 */

import { useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import type { AuditEntry } from '../../../lib/audit-trail-service.js';

export interface AuditEntryDetailProps {
  readonly entry: AuditEntry;
  readonly dataTestId?: string;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditEntryDetail({
  entry,
  dataTestId = 'audit-entry-detail',
}: AuditEntryDetailProps): ReactElement {
  const [requestOpen, setRequestOpen] = useState(true);
  const [responseOpen, setResponseOpen] = useState(true);

  return (
    <div data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <section>
        <button
          type="button"
          data-testid={`${dataTestId}-request-toggle`}
          aria-expanded={requestOpen}
          onClick={() => setRequestOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          <span aria-hidden="true">{requestOpen ? '▾' : '▸'}</span>
          <FormattedMessage id="editor.agent.audit.entry.request" />
        </button>
        {requestOpen ? (
          <pre
            data-testid={`${dataTestId}-request`}
            style={{
              margin: '6px 0 0 0',
              padding: 8,
              fontSize: 11,
              lineHeight: 1.4,
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 4,
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {stringify(entry.request)}
          </pre>
        ) : null}
      </section>

      <section>
        <button
          type="button"
          data-testid={`${dataTestId}-response-toggle`}
          aria-expanded={responseOpen}
          onClick={() => setResponseOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          <span aria-hidden="true">{responseOpen ? '▾' : '▸'}</span>
          <FormattedMessage id="editor.agent.audit.entry.response" />
          <span
            data-testid={`${dataTestId}-status`}
            style={{
              marginLeft: 6,
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 999,
              background: statusBackground(entry.status),
              color: statusForeground(entry.status),
            }}
          >
            {entry.status}
          </span>
        </button>
        {responseOpen ? (
          <pre
            data-testid={`${dataTestId}-response`}
            style={{
              margin: '6px 0 0 0',
              padding: 8,
              fontSize: 11,
              lineHeight: 1.4,
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 4,
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {stringify(entry.response)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}

function statusBackground(status: number): string {
  if (status >= 500) return 'rgba(220, 38, 38, 0.15)';
  if (status >= 400) return 'rgba(234, 179, 8, 0.18)';
  return 'rgba(34, 197, 94, 0.18)';
}

function statusForeground(status: number): string {
  if (status >= 500) return 'var(--color-danger-fg, currentColor)';
  if (status >= 400) return 'var(--color-warning-fg, currentColor)';
  return 'var(--color-success-fg, currentColor)';
}

export default AuditEntryDetail;
