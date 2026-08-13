/**
 * RequestBuilder — Wave 10 §S10.3.
 *
 * Middle column of the API explorer. Renders a request form for the
 * currently selected endpoint: method/path (locked), query params,
 * headers, body. Includes Save-as-snippet and Copy-as-cURL buttons.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Save, Send, Trash2, X } from 'lucide-react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import {
  type ApiExplorerAuth,
  type ApiExplorerResponse,
  type EndpointDef,
  formatAsCurl,
  saveSnippet,
} from '../../lib/api-explorer-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

type Kv = { key: string; value: string };

function kvFromRecord(rec: Record<string, string> | undefined): Kv[] {
  if (!rec) return [];
  return Object.entries(rec).map(([key, value]) => ({ key, value }));
}

function recordFromKv(rows: ReadonlyArray<Kv>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) {
    if (key.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

export interface RequestBuilderProps {
  endpoint: EndpointDef | null;
  auth: ApiExplorerAuth | undefined;
  onResponse: (response: ApiExplorerResponse | null) => void;
  onSend: (opts: {
    method: string;
    path: string;
    params: Record<string, string>;
    headers: Record<string, string>;
    body?: string;
    auth?: ApiExplorerAuth;
  }) => Promise<ApiExplorerResponse>;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}

export function RequestBuilder({
  endpoint,
  auth,
  onResponse,
  onSend,
  onError,
  onNotice,
}: RequestBuilderProps) {
  const [params, setParams] = useState<Kv[]>([]);
  const [headers, setHeaders] = useState<Kv[]>([
    { key: 'accept', value: 'application/json' },
  ]);
  const [body, setBody] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [snippetName, setSnippetName] = useState('');
  const [showSnippetInput, setShowSnippetInput] = useState(false);

  // Re-seed the form when the endpoint changes.
  useEffect(() => {
    if (!endpoint) return;
    setParams(kvFromRecord(endpoint.sample_params));
    setHeaders([{ key: 'accept', value: 'application/json' }]);
    setBody(
      endpoint.sample_body ? JSON.stringify(endpoint.sample_body, null, 2) : '',
    );
    setShowSnippetInput(false);
    setSnippetName('');
    onResponse(null);
  }, [endpoint, onResponse]);

  const bodyJsonError = useMemo(() => {
    if (
      !endpoint ||
      endpoint.method === 'GET' ||
      endpoint.method === 'DELETE' ||
      body.trim() === ''
    ) {
      return null;
    }
    try {
      JSON.parse(body);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid JSON';
    }
  }, [body, endpoint]);

  if (!endpoint) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Select an endpoint from the left to start building a request.
      </div>
    );
  }

  function setRow<K extends 'params' | 'headers'>(
    kind: K,
    idx: number,
    patch: Partial<Kv>,
  ) {
    const list = kind === 'params' ? params : headers;
    const setter = kind === 'params' ? setParams : setHeaders;
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    setter(next);
  }

  function addRow(kind: 'params' | 'headers') {
    const setter = kind === 'params' ? setParams : setHeaders;
    setter((prev) => [...prev, { key: '', value: '' }]);
  }

  function removeRow(kind: 'params' | 'headers', idx: number) {
    const setter = kind === 'params' ? setParams : setHeaders;
    setter((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSend() {
    if (!endpoint) return;
    const ep = endpoint;
    if (bodyJsonError) {
      onError(`Body is not valid JSON: ${bodyJsonError}`);
      return;
    }
    setSending(true);
    try {
      const res = await onSend({
        method: ep.method,
        path: ep.path,
        params: recordFromKv(params),
        headers: recordFromKv(headers),
        ...(body.trim() !== '' ? { body } : {}),
        ...(auth ? { auth } : {}),
      });
      onResponse(res);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSending(false);
    }
  }

  async function handleCopyCurl() {
    if (!endpoint) return;
    const ep = endpoint;
    const url = buildPreviewUrl(ep.path, params);
    const allHeaders: Record<string, string> = { ...recordFromKv(headers) };
    if (auth) {
      if (auth.kind === 'api_key') {
        allHeaders['authorization'] = `Bearer ${auth.value}`;
      } else if (auth.kind === 'oauth') {
        allHeaders['authorization'] = `OAuth ${auth.value}`;
      } else {
        allHeaders['x-mcp-token'] = auth.value;
      }
    }
    const cmd = formatAsCurl({
      method: ep.method,
      url,
      headers: allHeaders,
      ...(body.trim() !== '' ? { body } : {}),
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(cmd);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = cmd;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onNotice('Copied!');
    } catch {
      onError('Failed to copy to clipboard');
    }
  }

  async function handleSaveSnippet() {
    if (!endpoint) return;
    const ep = endpoint;
    if (!showSnippetInput) {
      setShowSnippetInput(true);
      return;
    }
    if (snippetName.trim() === '') {
      onError('Snippet name is required');
      return;
    }
    await saveSnippet({
      name: snippetName.trim(),
      endpoint: `${ep.method} ${ep.path}`,
      request: {
        method: ep.method,
        path: ep.path,
        params: recordFromKv(params),
        headers: recordFromKv(headers),
        body,
      },
    });
    setShowSnippetInput(false);
    setSnippetName('');
    onNotice('Snippet saved.');
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Method + path */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-[64px] justify-center rounded bg-slate-800 px-2 py-1 text-xs font-bold uppercase text-white">
            {endpoint.method}
          </span>
          <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs text-slate-800">
            {endpoint.path}
          </code>
        </div>
        <p className="mt-2 text-xs text-slate-600">{endpoint.description}</p>
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Params */}
        <KvSection
          titleId="admin.apiExplorer.params"
          rows={params}
          onAdd={() => addRow('params')}
          onChange={(i, patch) => setRow('params', i, patch)}
          onRemove={(i) => removeRow('params', i)}
          keyPh="key"
          valuePh="value"
        />

        {/* Headers */}
        <KvSection
          titleId="admin.apiExplorer.headers"
          rows={headers}
          onAdd={() => addRow('headers')}
          onChange={(i, patch) => setRow('headers', i, patch)}
          onRemove={(i) => removeRow('headers', i)}
          keyPh="header"
          valuePh="value"
        />

        {/* Body */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              <FormattedMessage id="admin.apiExplorer.body" catalogue={CATALOGUE} />
            </h3>
            {bodyJsonError && (
              <span className="text-[11px] font-medium text-rose-600">
                Invalid JSON — {bodyJsonError}
              </span>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="{}"
            rows={8}
            spellCheck={false}
            className="w-full rounded-md border border-slate-200 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || bodyJsonError !== null}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          {sending ? 'Sending…' : <FormattedMessage id="admin.apiExplorer.send" catalogue={CATALOGUE} />}
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveSnippet}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            <FormattedMessage id="admin.apiExplorer.saveSnippet" catalogue={CATALOGUE} />
          </button>
          <button
            type="button"
            onClick={handleCopyCurl}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            <FormattedMessage id="admin.apiExplorer.copyCurl" catalogue={CATALOGUE} />
          </button>
        </div>
        {showSnippetInput && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              placeholder={CATALOGUE['admin.apiExplorer.empty.snippetName']}
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveSnippet}
              className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSnippetInput(false);
                setSnippetName('');
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface KvSectionProps {
  titleId: string;
  rows: ReadonlyArray<Kv>;
  onAdd: () => void;
  onChange: (idx: number, patch: Partial<Kv>) => void;
  onRemove: (idx: number) => void;
  keyPh: string;
  valuePh: string;
}

function KvSection({ titleId, rows, onAdd, onChange, onRemove, keyPh, valuePh }: KvSectionProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          <FormattedMessage id={titleId} catalogue={CATALOGUE} />
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800"
        >
          <Plus className="h-3 w-3" aria-hidden /> add
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="rounded border border-dashed border-slate-200 px-2 py-1.5 text-[11px] text-slate-400">
            No rows.
          </p>
        )}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={row.key}
              onChange={(e) => onChange(i, { key: e.target.value })}
              placeholder={keyPh}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none"
            />
            <input
              type="text"
              value={row.value}
              onChange={(e) => onChange(i, { value: e.target.value })}
              placeholder={valuePh}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPreviewUrl(path: string, params: ReadonlyArray<Kv>): string {
  let url = path.replace(/:([a-zA-Z_]+)/g, (_, key: string) => {
    const row = params.find((p) => p.key === key);
    return row && row.value !== '' ? row.value : `:${key}`;
  });
  const extra = params.filter((p) => {
    if (p.key.trim() === '') return false;
    if (path.includes(`:${p.key}`)) return false;
    return p.value !== '';
  });
  if (extra.length > 0) {
    const qs = extra
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    url += `?${qs}`;
  }
  return url;
}
