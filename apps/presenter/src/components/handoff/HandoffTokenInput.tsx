'use client';

/**
 * HandoffTokenInput — token-entry surface for the recipient presenter.
 *
 * Per Wave 4 §S4.7 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from HandoffDialog: HandoffDialog is the presenter-A side
 * (mints the token + reveals it). This component is presenter-B side
 * (accepts a pasted/scanned token, validates shape, and submits the
 * handover to claim control). The two halves together form the
 * atomic state-transfer flow described in S4.7.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { HandoffClient, type HandoffClientError } from '../../runtime/handoff/handoff-client';
import type { PresenterSessionState } from '../../runtime/types';

export interface HandoffTokenInputProps {
  readonly sessionId: string;
  readonly etag: string;
  readonly apiBaseUrl?: string;
  readonly onClose: () => void;
  readonly onClaim: (next: PresenterSessionState) => void;
  readonly dataTestId?: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function HandoffTokenInput({
  sessionId,
  etag,
  apiBaseUrl,
  onClose,
  onClaim,
  dataTestId = 'handoff-token-input',
}: HandoffTokenInputProps): ReactElement {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validShape = TOKEN_PATTERN.test(token);

  const onSubmit = useCallback(async () => {
    if (!validShape) {
      setError('Token must be 8–128 chars (letters, digits, underscore, dash).');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const client = new HandoffClient({ baseUrl: apiBaseUrl ?? '' });
      // The recipient's presenter id is "self" — the server resolves it
      // from the session cookie / signed token. We pass an empty
      // state snapshot because the server already has the canonical
      // state pinned to the token's expected_version.
      const next = await client.apply({
        sessionId,
        toPresenterId: 'self',
        token,
        state: {},
        etag,
      });
      onClaim(next as unknown as PresenterSessionState);
      onClose();
    } catch (e) {
      const err = e as HandoffClientError;
      setError(`Handover failed: HTTP ${err.status}`);
    } finally {
      setSubmitting(false);
    }
  }, [apiBaseUrl, sessionId, token, etag, validShape, onClaim, onClose]);

  return (
    <div
      data-testid={dataTestId}
      role="dialog"
      aria-label="Accept handoff"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <section
        style={{
          background: 'var(--surface-base)',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxWidth: 420,
          width: '100%',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>🔁 Accept handoff</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close handoff dialog"
            data-testid={`${dataTestId}-close`}
            style={{
              padding: '2px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </header>

        <p style={{ fontSize: 12, marginTop: 8, color: 'var(--content-secondary)' }}>
          Paste the handoff token from the current presenter. State (slide,
          scenario, variables) will transfer atomically; the audience
          display stays on the current slide during the swap.
        </p>

        <input
          type="text"
          placeholder="Paste handoff token…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          data-testid={`${dataTestId}-field`}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '6px 8px',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface-base)',
            color: 'var(--content-primary)',
          }}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${dataTestId}-cancel`}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              background: 'var(--surface-base)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!validShape || submitting}
            data-testid={`${dataTestId}-submit`}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              background: 'var(--surface-raised)',
              cursor: !validShape || submitting ? 'not-allowed' : 'pointer',
              fontSize: 12,
            }}
          >
            {submitting ? 'Claiming…' : 'Claim session'}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            data-testid={`${dataTestId}-error`}
            style={{ fontSize: 11, color: 'var(--danger)', margin: '8px 0 0' }}
          >
            {error}
          </p>
        )}
      </section>
    </div>
  );
}