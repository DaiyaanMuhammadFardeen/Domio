/**
 * ResponseViewer — Wave 10 §S10.2.
 *
 * Renders the result of a webhook test:
 *   - status badge (color-coded by HTTP class)
 *   - latency (ms)
 *   - headers list
 *   - body (JSON pretty-print with collapsible sections when too long)
 */

'use client';

import { useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, type BadgeTone } from '../Badge';
import enMessages from '../../../messages/en.json';
import type { WebhookTestResult } from '../../lib/webhook-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

interface ResponseViewerProps {
  readonly result: WebhookTestResult | null;
  readonly emptyMessage?: string;
}

function toneForStatus(code: number): BadgeTone {
  if (code >= 200 && code < 300) return 'green';
  if (code >= 300 && code < 400) return 'brand';
  if (code >= 400 && code < 500) return 'amber';
  return 'red';
}

function tryPrettyJson(body: string): { pretty: string; isJson: boolean } {
  if (!body.trim()) return { pretty: body, isJson: false };
  try {
    const parsed = JSON.parse(body) as unknown;
    return { pretty: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { pretty: body, isJson: false };
  }
}

export function ResponseViewer({ result, emptyMessage }: ResponseViewerProps) {
  const [headersOpen, setHeadersOpen] = useState<boolean>(true);
  const [bodyOpen, setBodyOpen] = useState<boolean>(true);

  if (!result) {
    return (
      <div
        data-testid="webhooks-tester-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"
      >
        {emptyMessage ??
          CATALOGUE['admin.webhooks.tester.empty'] ??
          'Send a test to see the response.'}
      </div>
    );
  }

  const { pretty, isJson } = tryPrettyJson(result.body);
  const headerEntries = Object.entries(result.headers);

  return (
    <div
      data-testid="webhooks-tester-result"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={toneForStatus(result.status_code)}>
          <FormattedMessage id="admin.webhooks.tester.status" catalogue={CATALOGUE} />:{' '}
          {result.status_code}
        </Badge>
        <Badge tone="grey">
          <FormattedMessage id="admin.webhooks.tester.latency" catalogue={CATALOGUE} />:{' '}
          {result.latency_ms}ms
        </Badge>
        <span className="ml-auto font-mono text-[11px] text-slate-500">
          {new Date(result.sent_at_ms).toISOString()}
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setHeadersOpen((o) => !o)}
          aria-expanded={headersOpen}
          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100"
        >
          <span>
            <FormattedMessage id="admin.webhooks.tester.headers" catalogue={CATALOGUE} />
            {` (${headerEntries.length})`}
          </span>
          {headersOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {headersOpen && (
          <div
            data-testid="webhooks-tester-headers"
            className="mt-1 overflow-x-auto rounded-md border border-slate-100 bg-white"
          >
            {headerEntries.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">No headers</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <tbody>
                  {headerEntries.map(([key, val]) => (
                    <tr key={key} className="divide-x divide-slate-100">
                      <td className="w-1/3 px-3 py-1 font-mono text-slate-500">{key}</td>
                      <td className="px-3 py-1 font-mono text-slate-700">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setBodyOpen((o) => !o)}
          aria-expanded={bodyOpen}
          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100"
        >
          <span>
            <FormattedMessage id="admin.webhooks.tester.body" catalogue={CATALOGUE} />
            {isJson ? ' (json)' : ' (text)'}
          </span>
          {bodyOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        {bodyOpen && (
          <pre
            data-testid="webhooks-tester-body"
            className="mt-1 max-h-96 overflow-auto rounded-md border border-slate-100 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100"
          >
            {pretty || '(empty body)'}
          </pre>
        )}
      </div>
    </div>
  );
}
