/**
 * ResponseViewer — Wave 10 §S10.3.
 *
 * Right column of the API explorer. Displays the status badge, latency,
 * response headers list, and pretty-printed JSON body with collapsible
 * nodes. Empty state renders the i18n "send a request" hint.
 */

'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import type { ApiExplorerResponse } from '../../lib/api-explorer-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

export interface ResponseViewerProps {
  response: ApiExplorerResponse | null;
}

function statusTone(status: number): 'green' | 'amber' | 'red' {
  if (status >= 200 && status < 300) return 'green';
  if (status >= 300 && status < 500) return 'amber';
  return 'red';
}

function statusToneClass(tone: 'green' | 'amber' | 'red'): string {
  switch (tone) {
    case 'green':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'amber':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'red':
      return 'bg-rose-50 text-rose-700 border-rose-200';
  }
}

export function ResponseViewer({ response }: ResponseViewerProps) {
  if (!response) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
        <FormattedMessage id="admin.apiExplorer.empty.response" catalogue={CATALOGUE} />
      </div>
    );
  }

  const tone = statusTone(response.status);
  const bodyIsJson = (response.headers['content-type'] ?? '').includes('json');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold',
            statusToneClass(tone),
          )}
        >
          {response.status}{' '}
          {tone === 'green'
            ? CATALOGUE['admin.apiExplorer.status.ok']
            : CATALOGUE['admin.apiExplorer.status.error']}
        </span>
        <span className="text-xs text-slate-500">{response.latency_ms} ms</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Headers */}
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Headers
          </h3>
          {Object.keys(response.headers).length === 0 ? (
            <p className="text-[11px] text-slate-400">(no headers)</p>
          ) : (
            <ul className="space-y-0.5 rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px]">
              {Object.entries(response.headers).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-slate-500">{k}:</span>
                  <span className="truncate text-slate-800" title={v}>
                    {v}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Body */}
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Body
          </h3>
          {bodyIsJson ? (
            <JsonView value={response.body} />
          ) : (
            <pre className="max-h-[480px] overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
              {response.body}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

interface JsonViewProps {
  value: string;
}

function JsonView({ value }: JsonViewProps) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return (
      <pre className="max-h-[480px] overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {value}
      </pre>
    );
  }
  return (
    <div className="rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
      <JsonNode value={parsed} depth={0} keyName="" />
    </div>
  );
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  keyName: string;
}

function JsonNode({ value, depth, keyName }: JsonNodeProps) {
  const indent = '  '.repeat(depth);
  const label =
    keyName === '' ? '' : <span className="text-sky-300">{JSON.stringify(keyName)}</span>;
  const sep = keyName === '' ? '' : ': ';

  if (value === null) {
    return (
      <div style={{ paddingLeft: indent ? `${depth * 12}px` : undefined }}>
        {label}
        {sep}
        <span className="text-rose-300">null</span>
      </div>
    );
  }
  if (typeof value === 'string') {
    return (
      <div style={{ paddingLeft: `${depth * 12}px` }}>
        {label}
        {sep}
        <span className="text-emerald-300">{JSON.stringify(value)}</span>
      </div>
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: `${depth * 12}px` }}>
        {label}
        {sep}
        <span className="text-amber-300">{String(value)}</span>
      </div>
    );
  }
  if (Array.isArray(value)) {
    return <JsonArray value={value} depth={depth} label={label} sep={sep} />;
  }
  if (typeof value === 'object') {
    return (
      <JsonObject value={value as Record<string, unknown>} depth={depth} label={label} sep={sep} />
    );
  }
  return (
    <div style={{ paddingLeft: `${depth * 12}px` }}>
      {label}
      {sep}
      {String(value)}
    </div>
  );
}

interface ContainerProps {
  depth: number;
  label: React.ReactNode;
  sep: string;
  isArray: boolean;
  length: number;
  children: React.ReactNode;
}

function JsonContainer({ depth, label, sep, isArray, length, children }: ContainerProps) {
  const [open, setOpen] = useState(depth < 2);
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';
  if (length === 0) {
    return (
      <div style={{ paddingLeft: `${depth * 12}px` }}>
        {label}
        {sep}
        <span className="text-slate-400">
          {bracketOpen}
          {bracketClose}
        </span>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-1 text-left hover:text-white"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3 w-3 text-slate-500" aria-hidden />
        ) : (
          <ChevronRight className="mt-0.5 h-3 w-3 text-slate-500" aria-hidden />
        )}
        <span>
          {label}
          {sep}
          <span className="text-slate-400">{bracketOpen}</span>
          {!open && (
            <span className="ml-1 text-slate-500">
              {length} {isArray ? 'items' : 'keys'}
            </span>
          )}
        </span>
      </button>
      {open && <div>{children}</div>}
      {open && (
        <div style={{ paddingLeft: `${depth * 12}px` }} className="text-slate-400">
          {bracketClose}
        </div>
      )}
    </div>
  );
}

interface JsonObjectProps {
  value: Record<string, unknown>;
  depth: number;
  label: React.ReactNode;
  sep: string;
}

function JsonObject({ value, depth, label, sep }: JsonObjectProps) {
  const entries = Object.entries(value);
  return (
    <JsonContainer depth={depth} label={label} sep={sep} isArray={false} length={entries.length}>
      {entries.map(([k, v]) => (
        <JsonNode key={k} value={v} depth={depth + 1} keyName={k} />
      ))}
    </JsonContainer>
  );
}

interface JsonArrayProps {
  value: ReadonlyArray<unknown>;
  depth: number;
  label: React.ReactNode;
  sep: string;
}

function JsonArray({ value, depth, label, sep }: JsonArrayProps) {
  return (
    <JsonContainer depth={depth} label={label} sep={sep} isArray={true} length={value.length}>
      {value.map((v, i) => (
        <JsonNode key={i} value={v} depth={depth + 1} keyName={String(i)} />
      ))}
    </JsonContainer>
  );
}
