'use client';

/**
 * TemplateCard — single starter-template card with Download button.
 *
 * Per Wave 8 §S8.10. Used on the Component SDK landing to render
 * each entry from `listComponentTemplates()`.
 */

import { Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { Badge } from '../Badge';
import type { ComponentTemplate } from '../../lib/types';

export interface TemplateCardProps {
  readonly template: ComponentTemplate;
  readonly onDownload: (id: string) => void;
  readonly downloadLabel?: string;
}

const FRAMEWORK_LABEL: Readonly<Record<ComponentTemplate['framework'], string>> = {
  react: 'React 19',
  vue: 'Vue 3',
  'no-framework': 'No framework',
};

const LANGUAGE_TONE: Readonly<Record<ComponentTemplate['language'], 'green' | 'amber' | 'brand'>> = {
  typescript: 'green',
  javascript: 'amber',
  python: 'brand',
};

export function TemplateCard({
  template,
  onDownload,
  downloadLabel = 'Download',
}: TemplateCardProps): ReactElement {
  return (
    <div
      data-testid={`template-card-${template.id}`}
      className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            {template.name}
          </h3>
          <Badge tone={LANGUAGE_TONE[template.language]}>
            {template.language}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {template.description}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono">
            {FRAMEWORK_LABEL[template.framework]}
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          data-testid={`template-download-${template.id}`}
          onClick={() => onDownload(template.id)}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {downloadLabel}
        </button>
      </div>
    </div>
  );
}