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
import { publishToLibrary, type LibraryScope } from '../lib/team-library-service';
import { addToLibrary } from '../lib/library';

export interface PromoteDialogProps {
  open: boolean;
  elements: Element[];
  onClose: () => void;
  onPromote: (def: DomioComponentDef, replaceSelection: boolean) => void;
  /** Optional team ID; if present, the dialog exposes a scope toggle. */
  teamId?: string | undefined;
  /** Initial version; incremented if the host doesn't pass one. */
  initialVersion?: string | undefined;
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

export function PromoteDialog({
  open,
  elements,
  onClose,
  onPromote,
  teamId,
  initialVersion,
}: PromoteDialogProps): ReactElement | null {
  const t = useT();
  const [name, setName] = useState(() => autoName(elements));
  const [replaceSelection, setReplaceSelection] = useState(true);
  const [scope, setScope] = useState<LibraryScope>(teamId ? 'team' : 'personal');
  const [brandLocked, setBrandLocked] = useState(false);
  const [version, setVersion] = useState(() => initialVersion ?? '1.0.0');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      onPromote(previewDef, replaceSelection);
      // Persist through the library service (real backend or bootstrap).
      await publishToLibrary({
        catalogId,
        name,
        version,
        scope,
        teamId: scope === 'team' ? teamId : undefined,
        brandLocked,
      });
      // Also persist the local view so the Library panel reflects it.
      addToLibrary({
        catalogId,
        name,
        version,
        pinMode: 'track',
        pinValue: '',
      });
      onClose();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }, [previewDef, replaceSelection, onPromote, catalogId, name, version, scope, teamId, brandLocked, onClose]);

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
            <label className="promote-dialog__label" htmlFor="promote-version">Version</label>
            <input
              id="promote-version"
              type="text"
              className="promote-dialog__input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
              data-testid="promote-version"
            />
          </div>

          {teamId && (
            <div className="promote-dialog__field">
              <label className="promote-dialog__label">Scope</label>
              <div className="promote-dialog__scope" role="radiogroup">
                <button
                  type="button"
                  role="radio"
                  aria-checked={scope === 'personal'}
                  className={`promote-dialog__scope-btn${scope === 'personal' ? ' is-active' : ''}`}
                  onClick={() => setScope('personal')}
                  data-testid="promote-scope-personal"
                >
                  Personal
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={scope === 'team'}
                  className={`promote-dialog__scope-btn${scope === 'team' ? ' is-active' : ''}`}
                  onClick={() => setScope('team')}
                  data-testid="promote-scope-team"
                >
                  Team
                </button>
              </div>
            </div>
          )}

          <div className="promote-dialog__field">
            <label className="promote-dialog__checkbox-label">
              <input
                type="checkbox"
                checked={brandLocked}
                onChange={(e) => setBrandLocked(e.target.checked)}
                data-testid="promote-brand-lock"
              />
              Brand-lock this component (refuse overrides)
            </label>
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

          {publishError && (
            <div className="promote-dialog__error" data-testid="promote-error">
              {publishError}
            </div>
          )}
        </div>

        <footer className="promote-dialog__footer">
          <button type="button" className="promote-dialog__btn promote-dialog__btn--cancel" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button
            type="button"
            className="promote-dialog__btn promote-dialog__btn--save"
            onClick={handlePublish}
            disabled={publishing}
            data-testid="promote-publish"
          >
            {publishing ? 'Publishing…' : 'Publish to library'}
          </button>
        </footer>
      </div>
    </div>
  );
}
