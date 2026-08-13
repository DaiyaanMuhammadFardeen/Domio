'use client';

import { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { AssetKind, AssetUpload } from '../../lib/types';
import { useI18n } from '../../lib/i18n';

export interface FilesStepProps {
  readonly assets: ReadonlyArray<AssetUpload>;
  readonly onAdd: (kind: AssetKind, file: File) => void;
  readonly onRemove: (id: string) => void;
}

interface FileSlot {
  readonly kind: AssetKind;
  readonly testid: string;
  readonly labelKey: string;
  readonly accept: string;
}

const SLOTS: ReadonlyArray<FileSlot> = [
  {
    kind: 'component',
    testid: 'wizard-component-upload',
    labelKey: 'creator.wizard.files.component',
    accept: '.zip,.tgz,.json',
  },
  {
    kind: 'template',
    testid: 'wizard-template-upload',
    labelKey: 'creator.wizard.files.template',
    accept: '.zip,.tgz,.json',
  },
  {
    kind: 'sample-deck',
    testid: 'wizard-sample-upload',
    labelKey: 'creator.wizard.files.sample',
    accept: '.json,.pptx,.pdf',
  },
];

export function FilesStep({ assets, onAdd, onRemove }: FilesStepProps) {
  const { t } = useI18n();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function getAssetForKind(kind: AssetKind): AssetUpload | null {
    return assets.find((a) => a.kind === kind) ?? null;
  }

  function handlePick(kind: AssetKind) {
    const el = inputRefs.current[kind];
    if (el) el.click();
  }

  function handleFile(kind: AssetKind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onAdd(kind, file);
    e.target.value = '';
  }

  return (
    <section
      className="space-y-5"
      data-testid="wizard-step-files"
      aria-labelledby="wizard-files-heading"
    >
      <h2 id="wizard-files-heading" className="text-lg font-medium text-slate-900">
        {t('creator.wizard.files.heading')}
      </h2>

      {SLOTS.map((slot) => {
        const asset = getAssetForKind(slot.kind);
        const progressPct = asset?.progress_pct ?? 0;
        return (
          <div
            key={slot.kind}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-slate-900">{t(slot.labelKey)}</h3>
                {asset ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {asset.filename} · {(asset.size_bytes / 1024).toFixed(1)} KB
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500">No file chosen</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={slot.testid}
                  onClick={() => handlePick(slot.kind)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('creator.wizard.files.upload')}
                </button>
                {asset && (
                  <button
                    type="button"
                    onClick={() => onRemove(asset.id)}
                    aria-label={`Remove ${slot.kind}`}
                    className="inline-flex items-center rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[slot.kind] = el;
                  }}
                  type="file"
                  accept={slot.accept}
                  className="hidden"
                  onChange={(e) => handleFile(slot.kind, e)}
                />
              </div>
            </div>
            {asset && (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {asset.status} · {progressPct}%
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}