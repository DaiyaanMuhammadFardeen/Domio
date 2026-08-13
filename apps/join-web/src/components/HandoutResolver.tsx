/**
 * @domio/join-web — HandoutResolver.
 *
 * Per Wave 5 §S5.3 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Effectful wrapper around HandoutView. Fetches the handout descriptor
 * via the handout-service and feeds it down to HandoutView. Handles the
 * three terminal states — loading, error, and the rendered handout —
 * and exposes a `data-testid` hook on each state for test selectors.
 *
 * The fetch function is injected so tests can fully stub the network
 * layer; production defaults to the bundled handout-service.
 */

'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { HandoutView } from './HandoutView';
import { fetchHandout, HandoutResolveError, type HandoutDescriptor } from '@/lib/handout-service';

export interface HandoutResolverProps {
  readonly token: string;
  readonly apiBaseUrl?: string;
  /** Injected for tests; defaults to `fetchHandout` from the service. */
  readonly fetchFn?: typeof fetchHandout;
  readonly dataTestId?: string;
  readonly onDownloadPdf?: (descriptor: HandoutDescriptor) => void;
}

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly descriptor: HandoutDescriptor };

export function HandoutResolver({
  token,
  apiBaseUrl,
  fetchFn,
  dataTestId = 'handout-resolver',
  onDownloadPdf,
}: HandoutResolverProps): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const fn =
      fetchFn ?? ((t: string, base?: string, f?: typeof fetch) => fetchHandout(t, base, f));
    Promise.resolve()
      .then(() => fn(token, apiBaseUrl))
      .then((descriptor) => {
        if (cancelled) return;
        setState({ status: 'ready', descriptor });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof HandoutResolveError
            ? `Couldn’t load your handout (${err.status}).`
            : err instanceof Error
              ? err.message
              : 'Couldn’t load your handout.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [token, apiBaseUrl, fetchFn]);

  const handleDownload = useCallback(() => {
    if (state.status !== 'ready') return;
    if (onDownloadPdf) {
      onDownloadPdf(state.descriptor);
      return;
    }
    // Fallback: navigate to the service-provided PDF URL when present.
    const url = state.descriptor.pdf_url;
    if (typeof window !== 'undefined' && url) {
      window.location.href = url;
    }
  }, [state, onDownloadPdf]);

  if (state.status === 'loading') {
    return (
      <section
        data-testid={dataTestId}
        data-status="loading"
        className="bg-white rounded-lg shadow p-4 text-slate-600"
      >
        Loading your handout…
      </section>
    );
  }
  if (state.status === 'error') {
    return (
      <section
        data-testid={dataTestId}
        data-status="error"
        className="bg-white rounded-lg shadow p-4 flex flex-col gap-2"
        role="alert"
      >
        <p className="text-red-700">{state.message}</p>
        <button
          type="button"
          className="bg-slate-900 text-white rounded p-2 text-sm self-start"
          onClick={() => setState({ status: 'loading' })}
          data-testid="handout-resolver-retry"
        >
          Retry
        </button>
      </section>
    );
  }
  return (
    <section data-testid={dataTestId} data-status="ready">
      <HandoutView
        descriptor={state.descriptor}
        onDownloadPdf={onDownloadPdf || state.descriptor.pdf_url ? handleDownload : undefined}
      />
    </section>
  );
}
