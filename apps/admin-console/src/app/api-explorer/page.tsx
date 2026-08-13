/**
 * API Explorer admin page — Wave 10 §S10.3.
 *
 * Three-column Postman-style console for trying the public Domio REST
 * API. The left column lists every endpoint grouped by resource; the
 * middle column builds it; the right column shows the response.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import {
  AuthSelector,
  EndpointTree,
  RequestBuilder,
  ResponseViewer,
} from '../../components/api-explorer';
import {
  executeRequest,
  listEndpoints,
  type ApiExplorerAuth,
  type ApiExplorerResponse,
  type EndpointDef,
} from '../../lib/api-explorer-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

export default function ApiExplorerPage() {
  const [endpoints, setEndpoints] = useState<ReadonlyArray<EndpointDef>>([]);
  const [selected, setSelected] = useState<EndpointDef | null>(null);
  const [auth, setAuth] = useState<ApiExplorerAuth | undefined>(undefined);
  const [response, setResponse] = useState<ApiExplorerResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const eps = await listEndpoints();
      if (cancelled) return;
      setEndpoints(eps);
      // Default to the first endpoint so the page is interactive on mount.
      setSelected(eps[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSend = useCallback(
    async (opts: Parameters<typeof executeRequest>[0]) => {
      setError(null);
      const res = await executeRequest(opts);
      return res;
    },
    [],
  );

  // Auto-clear transient notices after 3s.
  useEffect(() => {
    if (!notice && !error) return;
    const id = window.setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [notice, error]);

  return (
    <main className="mx-auto flex h-[calc(100vh-72px)] max-w-[1600px] flex-col px-6 py-4">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            <FormattedMessage id="admin.apiExplorer.heading" catalogue={CATALOGUE} />
          </h1>
          <p className="text-xs text-slate-500">
            Try every public endpoint, see the response, copy as cURL.
          </p>
        </div>
        <AuthSelector auth={auth} onChange={setAuth} />
      </header>

      {/* Transient banner */}
      {(notice || error) && (
        <div
          role="status"
          className={
            'mt-2 rounded-md border px-3 py-2 text-xs ' +
            (error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700')
          }
        >
          {error ?? notice}
        </div>
      )}

      {/* Three-column layout */}
      <div className="mt-3 grid flex-1 grid-cols-12 gap-3 overflow-hidden">
        {/* Left: endpoint tree */}
        <section
          aria-label={CATALOGUE['admin.apiExplorer.endpoints']}
          className="col-span-3 overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <FormattedMessage id="admin.apiExplorer.endpoints" catalogue={CATALOGUE} />
          </div>
          <EndpointTree
            endpoints={endpoints}
            selectedKey={selected ? `${selected.method} ${selected.path}` : null}
            onSelect={setSelected}
          />
        </section>

        {/* Middle: request builder */}
        <section
          aria-label={CATALOGUE['admin.apiExplorer.request']}
          className="col-span-4 overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <FormattedMessage id="admin.apiExplorer.request" catalogue={CATALOGUE} />
          </div>
          <RequestBuilder
            endpoint={selected}
            auth={auth}
            onSend={handleSend}
            onResponse={setResponse}
            onError={setError}
            onNotice={setNotice}
          />
        </section>

        {/* Right: response viewer */}
        <section
          aria-label={CATALOGUE['admin.apiExplorer.response']}
          className="col-span-5 overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <FormattedMessage id="admin.apiExplorer.response" catalogue={CATALOGUE} />
          </div>
          <ResponseViewer response={response} />
        </section>
      </div>
    </main>
  );
}