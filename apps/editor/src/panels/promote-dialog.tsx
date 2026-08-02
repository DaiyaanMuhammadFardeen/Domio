/**
 * PromoteDialog — dialog for promoting selected elements to a component.
 * Name field, catalog slug, live SVG preview, save + replace options.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Element } from '@domio/schema';
import { inferPropsSchema, buildComponentDef } from '../lib/promote';
import { ComponentThumb } from '../components/ComponentThumb';
import { useT } from '../lib/locale';
import type { DomioComponentDef } from '@domio/components';

export interface PromoteDialogProps {
  open: boolean;
  elements: Element[];
  onClose: () => void;
  onPromote: (def: DomioComponentDef, replaceSelection: boolean) => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function autoName(elements: Element[]): string {
  if (elements.length === 0) return 'Untitled';
  if (elements.length === 1) {
    const el = elements[0]!;
    if (el.type === 'text' && el.text?.content) {
      return el.text.content.slice(0, 30);
    }
    return el.name || 'Untitled';
  }
  return `${elements.length} elements`;
}

export function PromoteDialog({ open, elements, onClose, onPromote }: PromoteDialogProps): ReactElement | null {
  const t = useT();
  const [name, setName] = useState(() => autoName(elements));
  const [replaceSelection, setReplaceSelection] = useState(true);

  const catalogId = useMemo(() => `my.${slugify(name) || 'untitled'}`, [name]);

  const schema = useMemo(() => inferPropsSchema(elements), [elements]);

  const previewDef = useMemo<DomioComponentDef>(
    () =>
      buildComponentDef({
        name,
        catalogId,
        elements,
        schema,
      }),
    [name, catalogId, elements, schema],
  );

  const handleSave = useCallback(() => {
    onPromote(previewDef, replaceSelection);
    onClose();
  }, [previewDef, replaceSelection, onPromote, onClose]);

  if (!open || elements.length === 0) return null;

  return (
    <div className="promote-dialog__scrim" role="dialog" aria-label={t('promote.title')}>
      <div className="promote-dialog__panel">
        <header className="promote-dialog__header">
          <h2 className="promote-dialog__title">{t('promote.title')}</h2>
          <p className="promote-dialog__sub">{t('promote.subtitle')}</p>
        </header>

        <div className="promote-dialog__body">
          <div className="promote-dialog__field">
            <label className="promote-dialog__label" htmlFor="promote-name">{t('promote.name')}</label>
            <input
              id="promote-name"
              type="text"
              className="promote-dialog__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('promote.namePlaceholder')}
            />
          </div>

          <div className="promote-dialog__field">
            <label className="promote-dialog__label">{t('promote.catalogId')}</label>
            <div className="promote-dialog__slug">{catalogId}</div>
          </div>

          <div className="promote-dialog__field">
            <label className="promote-dialog__label">{t('promote.preview')}</label>
            <div className="promote-dialog__thumb">
              <ComponentThumb def={previewDef} />
            </div>
          </div>

          <div className="promote-dialog__field">
            <label className="promote-dialog__checkbox-label">
              <input
                type="checkbox"
                checked={replaceSelection}
                onChange={(e) => setReplaceSelection(e.target.checked)}
              />
              {t('promote.replaceSelection')}
            </label>
          </div>
        </div>

        <footer className="promote-dialog__footer">
          <button type="button" className="promote-dialog__btn promote-dialog__btn--cancel" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button type="button" className="promote-dialog__btn promote-dialog__btn--save" onClick={handleSave}>
            {t('promote.saveToLibrary')}
          </button>
        </footer>
      </div>
    </div>
  );
}
