'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ListingKind, WizardDetails } from '../../lib/types';
import { useI18n } from '../../lib/i18n';

export interface DetailsStepProps {
  readonly details: WizardDetails | null;
  readonly onSave: (d: WizardDetails) => void;
}

const KIND_OPTIONS: ReadonlyArray<{ value: ListingKind; label: string }> = [
  { value: 'component', label: 'Component' },
  { value: 'template', label: 'Template' },
  { value: 'theme', label: 'Theme' },
  { value: 'sticker_pack', label: 'Sticker Pack' },
  { value: 'icon_pack', label: 'Icon Pack' },
];

export function DetailsStep({ details, onSave }: DetailsStepProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState<string>(details?.title ?? '');
  const [description, setDescription] = useState<string>(details?.description ?? '');
  const [tags, setTags] = useState<ReadonlyArray<string>>(details?.tags ?? []);
  const [tagDraft, setTagDraft] = useState<string>('');
  const [category, setCategory] = useState<ListingKind>(details?.category ?? 'component');
  const [licenseId, setLicenseId] = useState<string>(details?.license_id ?? '');
  const [error, setError] = useState<string | null>(null);

  function addTag() {
    const trimmed = tagDraft.trim();
    if (trimmed.length === 0) return;
    if (tags.includes(trimmed)) {
      setTagDraft('');
      return;
    }
    setTags([...tags, trimmed]);
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleNext() {
    if (title.trim().length === 0) {
      setError('Title is required');
      return;
    }
    if (description.trim().length === 0) {
      setError('Description is required');
      return;
    }
    if (tags.length === 0) {
      setError('At least one tag is required');
      return;
    }
    if (licenseId.trim().length === 0) {
      setError('License is required');
      return;
    }
    setError(null);
    onSave({
      title: title.trim(),
      description: description.trim(),
      tags,
      category,
      license_id: licenseId.trim(),
    });
  }

  return (
    <section
      className="space-y-4"
      data-testid="wizard-step-details"
      aria-labelledby="wizard-details-heading"
    >
      <h2 id="wizard-details-heading" className="text-lg font-medium text-slate-900">
        {t('creator.wizard.details.title')}
      </h2>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="wizard-title" className="block text-sm font-medium text-slate-700">
          {t('creator.wizard.details.title')}
        </label>
        <input
          id="wizard-title"
          data-testid="wizard-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="wizard-description" className="block text-sm font-medium text-slate-700">
          {t('creator.wizard.details.description')}
        </label>
        <textarea
          id="wizard-description"
          data-testid="wizard-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div>
        <label htmlFor="wizard-tag-input" className="block text-sm font-medium text-slate-700">
          {t('creator.wizard.details.tags')}
        </label>
        <div
          className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5"
          data-testid="wizard-tags"
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
                className="text-brand-700 hover:text-brand-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            id="wizard-tag-input"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder={t('creator.wizard.details.tagPlaceholder')}
            className="flex-1 min-w-[120px] border-0 px-1 py-0.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={addTag}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            aria-label="Add tag"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="wizard-category" className="block text-sm font-medium text-slate-700">
          {t('creator.wizard.details.category')}
        </label>
        <select
          id="wizard-category"
          data-testid="wizard-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ListingKind)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="wizard-license" className="block text-sm font-medium text-slate-700">
          {t('creator.wizard.details.license')}
        </label>
        <input
          id="wizard-license"
          data-testid="wizard-license"
          type="text"
          value={licenseId}
          onChange={(e) => setLicenseId(e.target.value)}
          placeholder="MIT"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          data-testid="wizard-next"
          onClick={handleNext}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          {t('creator.wizard.next')}
        </button>
      </div>
    </section>
  );
}
