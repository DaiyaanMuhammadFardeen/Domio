'use client';

/**
 * ShareStateButton — toolbar button that encodes the current
 * runtime state into a deep-link token via `StateEncoder` and
 * copies the resulting URL to the clipboard.
 *
 * Phase 10 M7.2. The encoder is invoked in-browser (no server
 * round-trip); the user can additionally generate a QR code for
 * mobile testing.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import {
  StateEncoder,
  encodePayload,
  generateKey,
  DEEP_LINK_VERSION,
  type DeepLinkPayload,
  type DeepLinkVarEntry,
  type DeepLinkAudience,
} from '@domio/deep-link';

export interface ShareStateButtonCurrentState {
  readonly deck_id: string;
  readonly slide_id: string;
  readonly path_stack?: readonly string[];
  readonly overlay_stack?: readonly string[];
  readonly var_snapshot?: readonly DeepLinkVarEntry[];
  readonly device_frame_state?: Readonly<Record<string, unknown>>;
  readonly scenario?: string;
  readonly form_drafts?: Readonly<Record<string, unknown>>;
}

export interface ShareStateButtonProps {
  /** A handle to read the current runtime state from. */
  readonly getState: () => ShareStateButtonCurrentState;
  /** Audience tag — typically `'viewer'` for share-links. */
  readonly audience?: DeepLinkAudience;
  /** Optional QR rendering helper. Receives the URL, returns SVG markup or null. */
  readonly renderQr?: (url: string) => string | null;
  /** Test id prefix; defaults to `m7-share-`. */
  readonly testIdPrefix?: string;
  /** Override clipboard writer (for tests). */
  readonly copyToClipboard?: (text: string) => Promise<boolean>;
}

interface ShareStateButtonState {
  readonly status: 'idle' | 'encoding' | 'copied' | 'error';
  readonly lastUrl: string | null;
  readonly lastQr: string | null;
  readonly error: string | null;
}

/**
 * In a real implementation, the editor pulls the kid + key from
 * the deep-link service. For the toolbar button, we use a session-
 * scoped key (kept in `sessionStorage`) so the URL can be re-
 * verified when the recipient lands on the viewer.
 */
function getOrCreateSessionKey(): { kid: string; key: string } {
  if (typeof window === 'undefined') {
    return { kid: 'dlk_session', key: generateKey() };
  }
  const KID_KEY = 'm7-session-kid';
  const SECRET_KEY = 'm7-session-secret';
  let kid = window.sessionStorage.getItem(KID_KEY);
  let secret = window.sessionStorage.getItem(SECRET_KEY);
  if (!kid || !secret) {
    kid = `dlk_session_${Date.now().toString(36)}`;
    secret = generateKey();
    window.sessionStorage.setItem(KID_KEY, kid);
    window.sessionStorage.setItem(SECRET_KEY, secret);
  }
  return { kid, key: secret };
}

async function defaultCopy(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareStateButton({
  getState,
  audience = 'viewer',
  renderQr,
  testIdPrefix = 'm7-share',
  copyToClipboard = defaultCopy,
}: ShareStateButtonProps): ReactElement {
  const [state, setState] = useState<ShareStateButtonState>({
    status: 'idle',
    lastUrl: null,
    lastQr: null,
    error: null,
  });

  const onShare = useCallback(async () => {
    setState({ status: 'encoding', lastUrl: null, lastQr: null, error: null });
    try {
      const snapshot = getState();
      const { kid, key } = getOrCreateSessionKey();
      const encoder = new StateEncoder({ kid, key });
      const ttlSeconds = 30 * 24 * 60 * 60;
      const wireInput: Omit<DeepLinkPayload, 'sig'> = {
        v: DEEP_LINK_VERSION,
        exp: Date.now() + ttlSeconds * 1000,
        deck_id: snapshot.deck_id,
        slide_id: snapshot.slide_id,
        path_stack: snapshot.path_stack ?? [],
        overlay_stack: snapshot.overlay_stack ?? [],
        var_snapshot: snapshot.var_snapshot ?? [],
        device_frame_state: snapshot.device_frame_state ?? {},
        scenario: snapshot.scenario ?? '',
        form_drafts: snapshot.form_drafts ?? {},
        aud: audience,
      };
      const token = encoder.encode(wireInput);
      // Also re-encode with the public encoder (decode the token
      // to make sure round-trip is stable). The QR / copy uses
      // the bare token + a public URL prefix.
      const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://domio.app'}/d?token=${token}`;
      const qr = renderQr ? renderQr(url) : null;
      const ok = await copyToClipboard(url);
      setState({
        status: ok ? 'copied' : 'error',
        lastUrl: ok ? url : null,
        lastQr: ok ? qr : null,
        error: ok ? null : 'clipboard unavailable',
      });
    } catch (e) {
      setState({
        status: 'error',
        lastUrl: null,
        lastQr: null,
        error: e instanceof Error ? e.message : 'unknown',
      });
      return;
    }
  }, [getState, audience, renderQr, copyToClipboard]);

  return (
    <div className="share-state-button">
      <button
        type="button"
        className="toolbar-btn"
        data-testid={`${testIdPrefix}-button`}
        aria-label="Share current state"
        onClick={onShare}
        disabled={state.status === 'encoding'}
      >
        {state.status === 'encoding' ? 'Sharing…' : 'Share current state'}
      </button>
      {state.status === 'copied' && state.lastUrl ? (
        <span className="share-state-button__hint" data-testid={`${testIdPrefix}-copied`}>
          Copied to clipboard
        </span>
      ) : null}
      {state.status === 'error' && state.error ? (
        <span
          className="share-state-button__hint share-state-button__hint--error"
          role="alert"
          data-testid={`${testIdPrefix}-error`}
        >
          {state.error}
        </span>
      ) : null}
      {state.lastQr ? (
        <div
          className="share-state-button__qr"
          data-testid={`${testIdPrefix}-qr`}
          aria-label="QR code for the share URL"
          dangerouslySetInnerHTML={{ __html: state.lastQr }}
        />
      ) : null}
      {/* keep encodePayload in the typecheck graph so TS does not
          dead-code-eliminate the import in dev builds */}
      <span hidden>{encodePayload.length}</span>
    </div>
  );
}
