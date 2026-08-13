'use client';

/**
 * ErrorBoundary + ErrorCard — recoverable error UI.
 *
 * Per Wave 1 §S1.6 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Two pieces:
 *   - `<ErrorBoundary>`: React class component that catches errors thrown
 *     in its subtree and renders a fallback. Useful at app roots and
 *     around route sections.
 *   - `<ErrorCard>`: a leaf card that displays a captured error with a
 *     Retry button. Used by SuspenseBoundary's default error fallback.
 *
 * Trace id generation:
 *   - For now, generates a random short hex string.
 *   - Hooks into the optional `errorReportUrl` prop to POST errors to a
 *     backend ingest endpoint (no-op if not provided).
 */

import {
  Component,
  type ErrorInfo,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface ErrorCardProps {
  error: Error;
  traceId?: string;
  onRetry?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
}

export function ErrorCard(props: ErrorCardProps): ReactElement {
  const { error, traceId, onRetry, title = 'Something went wrong' } = props;
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-6)',
        background: 'var(--surface-1)',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--radius-lg)',
        color: 'var(--content-primary)',
      }}
    >
      <h3
        style={{
          margin: 0,
          marginBottom: 'var(--space-2)',
          color: 'var(--danger)',
          fontSize: 'var(--font-heading-size)',
          fontWeight: 600,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          marginBottom: 'var(--space-4)',
          color: 'var(--content-secondary)',
        }}
      >
        {error.message || 'An unexpected error occurred.'}
      </p>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              appearance: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--surface-2)',
              color: 'var(--content-primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        ) : null}
        {traceId ? (
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-caption-size)',
              color: 'var(--content-muted)',
            }}
          >
            trace: {traceId}
          </code>
        ) : null}
      </div>
    </div>
  );
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactElement;
  /** Optional URL to POST captured errors to (e.g. /v1/observability/errors). */
  errorReportUrl?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  traceId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, traceId: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const traceId = generateTraceId();
    this.setState({ traceId });
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack, { traceId });
    }
    const url = this.props.errorReportUrl;
    if (url) {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack ?? null,
          traceId,
        }),
        keepalive: true,
      }).catch(() => {
        /* swallow — best effort */
      });
    }
  }

  reset = (): void => {
    this.setState({ error: null, traceId: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      const cardProps: ErrorCardProps = {
        error: this.state.error,
        onRetry: this.reset,
        ...(this.state.traceId ? { traceId: this.state.traceId } : {}),
      };
      return <ErrorCard {...cardProps} />;
    }
    return this.props.children;
  }
}

function generateTraceId(): string {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Math.random().toString(16).slice(2, 14);
}
