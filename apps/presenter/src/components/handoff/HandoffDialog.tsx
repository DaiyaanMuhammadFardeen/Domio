'use client';

/**
 * HandoffDialog — UI for transferring a live session to another presenter.
 *
 * Flow:
 *   1. Presenter A clicks "Hand off session", enters the recipient id.
 *   2. The component POSTs `/handover/init` and receives a token.
 *   3. The component shows the token + a copy-to-clipboard button. The
 *      recipient pastes the token (or scans a QR — future) into their
 *      presenter view, which POSTs `/handover` with the matching etag.
 *   4. On success the dialog closes and the session row updates.
 *
 * For now the dialog shows the minted token in a `<code>` block and
 * accepts a manual "I am the recipient" toggle that calls `apply` on
 * the same device — useful for the boot test and for the multi-presenter
 * hot-swap demo.
 */

import { useCallback, useState } from 'react';
import { HandoffClient, type HandoffClientError } from '../../runtime/handoff/handoff-client';
import type { PresenterSessionState } from '../../runtime/types';

export interface HandoffDialogProps {
  sessionId: string;
  state: PresenterSessionState;
  etag: string;
  apiBaseUrl?: string;
  onClose: () => void;
  onHandover: (next: PresenterSessionState) => void;
}

export function HandoffDialog({
  sessionId,
  state,
  etag,
  apiBaseUrl,
  onClose,
  onHandover,
}: HandoffDialogProps) {
  const client = new HandoffClient({ baseUrl: apiBaseUrl ?? '' });
  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<{
    token: string;
    expires_at_ms: number;
    expected_version: number;
  } | null>(null);

  const onMint = useCallback(async () => {
    if (!recipient.trim()) {
      setStatus({ kind: 'error', message: 'recipient id is required' });
      return;
    }
    setBusy(true);
    try {
      const res = await client.mint(sessionId, recipient.trim(), 60_000);
      setMinted(res);
      setStatus({ kind: 'ok', message: 'token minted' });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as HandoffClientError).message });
    } finally {
      setBusy(false);
    }
  }, [client, recipient, sessionId]);

  const onApply = useCallback(async () => {
    if (!minted) return;
    setBusy(true);
    try {
      const next = await client.apply({
        sessionId,
        toPresenterId: recipient.trim(),
        token: minted.token,
        state: state.state as unknown as Record<string, unknown>,
        etag,
      });
      onHandover(next as unknown as PresenterSessionState);
      setStatus({ kind: 'ok', message: 'handover complete' });
      onClose();
    } catch (e) {
      setStatus({ kind: 'error', message: (e as HandoffClientError).message });
    } finally {
      setBusy(false);
    }
  }, [client, etag, minted, onClose, onHandover, recipient, sessionId, state.state]);

  const onCopy = useCallback(() => {
    if (!minted) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(minted.token).catch(() => {
        /* ignore — user can copy manually */
      });
    }
  }, [minted]);

  return (
    <div className="handoff-dialog" role="dialog" aria-label="Hand off session">
      <header className="handoff-dialog__header">
        <h3>Hand off session</h3>
        <button
          type="button"
          className="handoff-dialog__close"
          onClick={onClose}
          aria-label="Close handoff"
        >
          ✕
        </button>
      </header>
      <div className="handoff-dialog__body">
        <label className="handoff-dialog__field">
          Recipient presenter id
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="presenter_xyz"
            className="handoff-dialog__input"
          />
        </label>
        <button
          type="button"
          className="handoff-dialog__btn handoff-dialog__btn--primary"
          onClick={onMint}
          disabled={busy || !recipient.trim()}
        >
          Mint transfer token
        </button>

        {minted && (
          <div className="handoff-dialog__token">
            <p>
              Token (share securely; expires at{' '}
              {new Date(minted.expires_at_ms).toLocaleTimeString()}):
            </p>
            <code className="handoff-dialog__code">{minted.token}</code>
            <div className="handoff-dialog__token-actions">
              <button type="button" onClick={onCopy} className="handoff-dialog__btn">
                Copy
              </button>
              <button
                type="button"
                onClick={onApply}
                className="handoff-dialog__btn handoff-dialog__btn--primary"
                disabled={busy}
              >
                Apply (this device)
              </button>
            </div>
          </div>
        )}

        {status && (
          <div
            className={`handoff-dialog__status handoff-dialog__status--${status.kind}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
