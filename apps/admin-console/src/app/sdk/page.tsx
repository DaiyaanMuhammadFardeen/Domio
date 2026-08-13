/**
 * SDK landing page — Wave 8 §S8.8.
 *
 * Self-contained landing for the public Domio SDK: quickstart curl
 * snippet, download links for the npm/pnpm/maven/pip packages, and a
 * pointer to the full docs site. No external data — the page is just
 * documentation surface so a static mock works.
 */

'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

const QUICKSTART = `curl -fsSL https://get.domio.app/install.sh | bash
# Or one of the package managers below — pick the right one for your stack.`;

interface DownloadLink {
  readonly id: string;
  readonly label: string;
  readonly package: string;
  readonly command: string;
}

const DOWNLOADS: ReadonlyArray<DownloadLink> = [
  {
    id: 'npm',
    label: 'npm',
    package: '@domio/sdk',
    command: 'npm install @domio/sdk',
  },
  {
    id: 'pnpm',
    label: 'pnpm',
    package: '@domio/sdk',
    command: 'pnpm add @domio/sdk',
  },
  {
    id: 'maven',
    label: 'Maven',
    package: 'app.domio:sdk-java',
    command:
      '<dependency>\n  <groupId>app.domio</groupId>\n  <artifactId>sdk-java</artifactId>\n  <version>0.4.1</version>\n</dependency>',
  },
  {
    id: 'pip',
    label: 'pip',
    package: 'domio',
    command: 'pip install domio',
  },
];

const DOCS_URL = 'https://docs.domio.app/sdk';

export default function SDKPage() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyToClipboard(key: string, text: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        window.setTimeout(() => setCopied(null), 2000);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div data-testid="sdk-page" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          <FormattedMessage id="admin.sdk.heading" catalogue={CATALOGUE} />
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <FormattedMessage id="admin.sdk.subheading" catalogue={CATALOGUE} />
        </p>
      </header>

      <section
        data-testid="sdk-quickstart"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <FormattedMessage id="admin.sdk.quickstart" catalogue={CATALOGUE} />
        </h2>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
            {QUICKSTART}
          </pre>
          <button
            type="button"
            onClick={() => void copyToClipboard('quickstart', QUICKSTART)}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
          >
            <Copy className="h-3 w-3" aria-hidden />
            {copied === 'quickstart' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <section
        data-testid="sdk-downloads"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <FormattedMessage id="admin.sdk.download" catalogue={CATALOGUE} />
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DOWNLOADS.map((d) => (
            <div
              key={d.id}
              data-testid={`sdk-download-${d.id}`}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{d.label}</span>
                <span className="font-mono text-xs text-slate-500">{d.package}</span>
              </div>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-white p-3 font-mono text-xs text-slate-800">
                  {d.command}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(d.id, d.command)}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Copy className="h-3 w-3" aria-hidden />
                  {copied === d.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        data-testid="sdk-docs"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          Full documentation
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Reference for every REST endpoint, webhook event, and SDK call.
        </p>
        <a
          href={DOCS_URL}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          View full docs
          <span aria-hidden>→</span>
        </a>
      </section>
    </div>
  );
}
