'use client';

/**
 * VoiceAuditLog — table of past voice matches.
 *
 * Per Wave 11 §S11.5, every match must be auditable. Columns:
 * timestamp, phrase, action, confidence, status.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  type VoiceMatch,
  type VoiceMatchStatus,
  listVoiceMatches,
} from '../../lib/voice-service';

export interface VoiceAuditLogProps {
  readonly sessionId: string;
  readonly heading?: string;
  readonly emptyLabel?: string;
  readonly dataTestId?: string;
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(11, 19);
  } catch {
    return '—';
  }
}

function statusLabel(status: VoiceMatchStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'auto_dismissed':
      return 'Auto-dismissed';
  }
}

export function VoiceAuditLog({
  sessionId,
  heading = 'Voice audit log',
  emptyLabel = 'No matches yet.',
  dataTestId = 'voice-audit-log',
}: VoiceAuditLogProps): ReactElement {
  const [matches, setMatches] = useState<VoiceMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listVoiceMatches(sessionId);
      setMatches(list);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to refresh events emitted by the VoiceListener. The
  // listener dispatches a DOM event after recording a match so we don't
  // need a shared store.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChanged = () => {
      refresh();
    };
    window.addEventListener('domio:voice-match-recorded', onChanged);
    return () => window.removeEventListener('domio:voice-match-recorded', onChanged);
  }, [refresh]);

  return (
    <section
      data-testid={dataTestId}
      aria-label={heading}
      style={{
        padding: 12,
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        background: 'var(--surface-base)',
        color: 'var(--content-primary)',
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14, fontWeight: 700 }}>{heading}</h3>
      <div role="table" style={{ width: '100%', fontSize: 12 }}>
        <div
          role="row"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '4px 0',
          }}
        >
          <div role="columnheader" style={{ width: '18%', fontWeight: 700, fontSize: 11 }}>Time</div>
          <div role="columnheader" style={{ width: '34%', fontWeight: 700, fontSize: 11 }}>Phrase</div>
          <div role="columnheader" style={{ width: '18%', fontWeight: 700, fontSize: 11 }}>Action</div>
          <div role="columnheader" style={{ width: '14%', fontWeight: 700, fontSize: 11 }}>Confidence</div>
          <div role="columnheader" style={{ width: '16%', fontWeight: 700, fontSize: 11 }}>Status</div>
        </div>
        {loading && (
          <div role="row" style={{ padding: '8px 0', opacity: 0.7 }}>Loading…</div>
        )}
        {!loading && matches.length === 0 && (
          <div role="row" data-testid={`${dataTestId}-empty`} style={{ padding: '8px 0', opacity: 0.7 }}>
            {emptyLabel}
          </div>
        )}
        {matches.map((m) => (
          <div
            role="row"
            key={m.id}
            data-testid={`${dataTestId}-row`}
            data-match-id={m.id}
            data-status={m.status}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 0',
              borderBottom: '1px dashed var(--border-subtle)',
            }}
          >
            <div style={{ width: '18%' }}>{formatTime(m.timestamp_ms)}</div>
            <div style={{ width: '34%' }}>{m.phrase}</div>
            <div style={{ width: '18%' }}>{m.action}</div>
            <div style={{ width: '14%' }}>{m.confidence.toFixed(2)}</div>
            <div style={{ width: '16%' }}>{statusLabel(m.status)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}