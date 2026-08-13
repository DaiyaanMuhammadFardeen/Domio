'use client';

/**
 * Component SDK landing page — Wave 8 §S8.10.
 *
 * Hero, quickstart, packages grid, templates, publish-to-org form,
 * and "build + test pipeline" links.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hammer, FlaskConical, Rocket, ExternalLink, Package } from 'lucide-react';
import { QuickstartCode } from '../../components/sdk/QuickstartCode';
import { TemplateCard } from '../../components/sdk/TemplateCard';
import { Badge } from '../../components/Badge';
import {
  listSDKPackages,
  listComponentTemplates,
  downloadComponentTemplate,
  publishComponentToOrg,
  SDK_STATUS_TONES,
} from '../../lib/component-sdk-service';
import type { ComponentTemplate, SDKPackageInfo } from '../../lib/types';

const QUICKSTART_NPM = `npm install @domio/component-sdk`;

const PIPELINE_BUILD_URL = 'https://docs.domio.app/sdk/build';
const PIPELINE_TEST_URL = 'https://docs.domio.app/sdk/test';
const PIPELINE_DEPLOY_URL = 'https://docs.domio.app/sdk/deploy';

const QUICKSTART_TS = `import { defineComponent } from '@domio/component-sdk';

export default defineComponent({
  id: 'hello-world',
  title: 'Hello world',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', default: 'Domio' },
    },
  },
  render: ({ name }) => ({
    type: 'text',
    value: \`Hello, \${name}!\`,
  }),
});`;

function formatMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export default function ComponentSDKPage() {
  const [packages, setPackages] = useState<ReadonlyArray<SDKPackageInfo>>([]);
  const [templates, setTemplates] = useState<ReadonlyArray<ComponentTemplate>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Publish form state
  const [publishName, setPublishName] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishVersion, setPublishVersion] = useState('0.1.0');
  const [publishTags, setPublishTags] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pkgs, tpls] = await Promise.all([listSDKPackages(), listComponentTemplates()]);
      setPackages(pkgs);
      setTemplates(tpls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SDK data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const packageCount = packages.length;
  const templateCount = templates.length;
  const subtitle = useMemo(
    () => `${packageCount} packages · ${templateCount} templates · Published from your CI`,
    [packageCount, templateCount],
  );

  async function handleDownload(id: string) {
    try {
      const blob = await downloadComponentTemplate(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download template');
    }
  }

  async function handlePublish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPublishBusy(true);
    setPublishSuccess(null);
    setError(null);
    try {
      const tags = publishTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await publishComponentToOrg({
        name: publishName,
        description: publishDescription,
        version: publishVersion,
        tags,
      });
      const msg = formatMessage('Published {name} v{version}', {
        name: publishName || res.id,
        version: publishVersion,
      });
      setPublishSuccess(msg);
      setPublishName('');
      setPublishDescription('');
      setPublishVersion('0.1.0');
      setPublishTags('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div data-testid="component-sdk-page">
      {/* Hero */}
      <section className="mb-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-8 text-white shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-200">
          <Package className="h-3.5 w-3.5" aria-hidden />
          Wave 8 · Developer
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Build Domio Components</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-200">
          Build custom components that integrate with the Domio editor. Install the SDK, scaffold a
          starter, and publish to your org library so every workspace can use it.
        </p>
        <div className="mt-4 text-xs text-slate-300">{subtitle}</div>
      </section>

      {error && (
        <div
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          role="alert"
        >
          <strong className="font-semibold">Error.</strong> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      )}

      {/* Quickstart */}
      {!loading && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Quickstart
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <QuickstartCode code={QUICKSTART_NPM} language="bash" label="install" />
            <QuickstartCode code={QUICKSTART_TS} language="typescript" label="hello-world.ts" />
          </div>
        </section>
      )}

      {/* SDK packages */}
      {!loading && packages.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            SDK packages
          </h2>
          <div data-testid="sdk-packages" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <a
                key={pkg.id}
                href={pkg.docs_url}
                target="_blank"
                rel="noreferrer"
                className="group flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-600">
                      {pkg.package}
                    </span>
                    <Badge tone={SDK_STATUS_TONES[pkg.status]}>{pkg.status}</Badge>
                  </div>
                  <div className="mt-2 font-mono text-sm text-slate-900">{pkg.package_name}</div>
                  <div className="mt-1 text-xs text-slate-500">v{pkg.version}</div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-brand-700 opacity-0 transition group-hover:opacity-100">
                  Docs <ExternalLink className="h-3 w-3" aria-hidden />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Templates */}
      {!loading && templates.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Starter templates
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <div key={tpl.id} data-testid={`sdk-template-${tpl.id}`}>
                <TemplateCard template={tpl} onDownload={handleDownload} downloadLabel="Download" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Publish form */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Publish to org library
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Push a built component to your org&apos;s component library. Visible to every workspace in
          the org immediately after publishing.
        </p>

        <form
          data-testid="sdk-publish-form"
          onSubmit={handlePublish}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="sdk-publish-name" className="text-xs font-medium text-slate-700">
              Component name
            </label>
            <input
              id="sdk-publish-name"
              data-testid="sdk-publish-name"
              type="text"
              required
              value={publishName}
              onChange={(e) => setPublishName(e.target.value)}
              placeholder="e.g. My Kpi Tile"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="sdk-publish-version" className="text-xs font-medium text-slate-700">
              Version
            </label>
            <input
              id="sdk-publish-version"
              type="text"
              required
              value={publishVersion}
              onChange={(e) => setPublishVersion(e.target.value)}
              placeholder="0.1.0"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="sdk-publish-description" className="text-xs font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="sdk-publish-description"
              value={publishDescription}
              onChange={(e) => setPublishDescription(e.target.value)}
              rows={2}
              placeholder="What does this component do?"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label htmlFor="sdk-publish-tags" className="text-xs font-medium text-slate-700">
              Tags (comma-separated)
            </label>
            <input
              id="sdk-publish-tags"
              type="text"
              value={publishTags}
              onChange={(e) => setPublishTags(e.target.value)}
              placeholder="kpi, tile, dashboard"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {publishSuccess && (
              <span className="text-xs font-medium text-emerald-700" role="status">
                {publishSuccess}
              </span>
            )}
            <button
              type="submit"
              data-testid="sdk-publish-submit"
              disabled={publishBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {publishBusy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </section>

      {/* Build + test pipeline */}
      <section className="mb-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Build &amp; test pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <a
            href={PIPELINE_BUILD_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-md"
          >
            <Hammer className="h-5 w-5 text-slate-500 group-hover:text-brand-600" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-slate-900">Build</div>
              <div className="text-xs text-slate-500">Compile + bundle the SDK output.</div>
            </div>
          </a>
          <a
            href={PIPELINE_TEST_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-md"
          >
            <FlaskConical
              className="h-5 w-5 text-slate-500 group-hover:text-brand-600"
              aria-hidden
            />
            <div>
              <div className="text-sm font-semibold text-slate-900">Run tests</div>
              <div className="text-xs text-slate-500">Vitest + Playwright suite.</div>
            </div>
          </a>
          <a
            href={PIPELINE_DEPLOY_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-md"
          >
            <Rocket className="h-5 w-5 text-slate-500 group-hover:text-brand-600" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-slate-900">Deploy to org</div>
              <div className="text-xs text-slate-500">Push to your org component library.</div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
