'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import {
  consumeMagicLink,
  type MagicLinkConsumeResult,
  type MagicLinkErrorCode,
} from '@domio/magic-link-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConsumeResult = MagicLinkConsumeResult;

type Status =
  | 'loading'
  | 'success'
  | 'error-invalid'
  | 'error-consumed'
  | 'error-revoked'
  | 'error-network'
  | 'error-unknown';

// ---------------------------------------------------------------------------
// Config (env vars with sensible defaults)
// ---------------------------------------------------------------------------

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_BASE ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Icons (inline SVG — no external deps)
// ---------------------------------------------------------------------------

function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

function CheckmarkIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <polyline className="checkmark" points="7 14.5 12 19.5 21 9.5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <line className="cross-icon" x1="9" y1="9" x2="19" y2="19" />
      <line className="cross-icon" x1="19" y1="9" x2="9" y2="19" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Core component (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function MagicLinkPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>('loading');
  const [result, setResult] = useState<ConsumeResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const consume = useCallback(async () => {
    if (!token) {
      setStatus('error-invalid');
      return;
    }

    setStatus('loading');

    try {
      const data = await consumeMagicLink(token);
      setResult(data);
      setStatus('success');

      // Redirect after a short pause so the user sees confirmation
      setTimeout(() => {
        window.location.href = `${APP_BASE}/${data.scope_id}`;
      }, 1800);
    } catch (e) {
      const err = e as { status: number; code: MagicLinkErrorCode };
      if (err.status === 0) {
        setStatus('error-network');
      } else if (err.code === 'invalid_token' || err.code === 'expired') {
        setStatus('error-invalid');
      } else if (err.code === 'consumed' || err.code === 'already_consumed') {
        setStatus('error-consumed');
      } else if (err.code === 'revoked') {
        setStatus('error-revoked');
      } else {
        setStatus('error-unknown');
      }
    }
  }, [token]);

  useEffect(() => {
    consume();
  }, [consume, retryCount]);

  // Missing token — immediate error
  if (!token) {
    return (
      <div className="container">
        <div className="card" role="main">
          <p className="card__logo">Domio</p>
          <div className="card__icon card__icon--error" aria-hidden="true">
            <ErrorIcon />
          </div>
          <h1 className="card__title">No link provided</h1>
          <p className="card__message">
            This page needs a valid invite link to work. Check the URL and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" role="main">
        <p className="card__logo">Domio</p>

        {/* Loading */}
        {status === 'loading' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--loading" aria-hidden="true">
              <Spinner />
            </div>
            <h1 className="card__title">Verifying your invite…</h1>
            <p className="card__message">
              Hang on while we check your link.
            </p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--success" aria-hidden="true">
              <CheckmarkIcon />
            </div>
            <h1 className="card__title">Your access is ready</h1>
            <p className="card__message">
              Opening your deck…
            </p>
            {result.guest_email && (
              <p className="card__note">
                Signed in as {result.guest_email}
              </p>
            )}
          </div>
        )}

        {/* Invalid / expired token */}
        {status === 'error-invalid' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--error" aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className="card__title">This link is invalid or has expired</h1>
            <p className="card__message">
              Ask the person who invited you to send a new one.
            </p>
          </div>
        )}

        {/* Already consumed */}
        {status === 'error-consumed' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--error" aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className="card__title">This link has already been used</h1>
            <p className="card__message">
              Each invite link can only be used once. If you need access again, ask the person who invited you for a new link.
            </p>
          </div>
        )}

        {/* Revoked */}
        {status === 'error-revoked' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--error" aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className="card__title">This invitation has been revoked</h1>
            <p className="card__message">
              The person who invited you has cancelled this invitation. If you think this is a mistake, reach out to them directly.
            </p>
          </div>
        )}

        {/* Network / other error */}
        {status === 'error-network' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--error" aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className="card__title">Something went wrong</h1>
            <p className="card__message">
              We couldn&apos;t reach the server. Check your connection and try again.
            </p>
            <button
              className="card__cta card__cta--primary"
              onClick={() => setRetryCount((c) => c + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {/* Unknown error */}
        {status === 'error-unknown' && (
          <div className="status-content" aria-live="polite">
            <div className="card__icon card__icon--error" aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className="card__title">Something unexpected happened</h1>
            <p className="card__message">
              We ran into an issue processing your invite. Try again, or contact the person who sent this link.
            </p>
            <button
              className="card__cta card__cta--primary"
              onClick={() => setRetryCount((c) => c + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (wrapped in Suspense for Next.js useSearchParams requirement)
// ---------------------------------------------------------------------------

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <div className="card" role="main">
            <p className="card__logo">Domio</p>
            <div className="card__icon card__icon--loading" aria-hidden="true">
              <Spinner />
            </div>
            <h1 className="card__title">Loading…</h1>
          </div>
        </div>
      }
    >
      <MagicLinkPageInner />
    </Suspense>
  );
}
