/**
 * LibraryPanel — "My Library" tab listing saved components
 * with version pinning and update badges.
 */

'use client';

import { useState, useCallback } from 'react';
import type { ReactElement } from 'react';
import { getComponent } from '@domio/components';
import { getLatestVersion } from '../lib/registry-manifest';
import {
  getLibraryItems,
  removeFromLibrary,
  updateLibraryItem,
  type LibraryItem,
  type PinMode,
} from '../lib/library';
import { ComponentThumb } from '../components/ComponentThumb';
import { cn } from '../lib/cn';
import { useT } from '../lib/locale';

interface LibraryPanelProps {
  onInsert: (catalogId: string) => void;
}

export function LibraryPanel({ onInsert }: LibraryPanelProps): ReactElement {
  const t = useT();
  const [items, setItems] = useState<LibraryItem[]>(() => getLibraryItems());
  const [, setTick] = useState(0);

  const refresh = useCallback(() => {
    setItems(getLibraryItems());
    setTick((t) => t + 1);
  }, []);

  const handleUpdate = useCallback(
    (item: LibraryItem) => {
      const latest = getLatestVersion(item.catalogId);
      if (latest) {
        updateLibraryItem(item.catalogId, { version: latest });
        refresh();
      }
    },
    [refresh],
  );

  const handleRemove = useCallback(
    (catalogId: string) => {
      removeFromLibrary(catalogId);
      refresh();
    },
    [refresh],
  );

  const handlePinMode = useCallback(
    (catalogId: string, mode: PinMode) => {
      updateLibraryItem(catalogId, { pinMode: mode, pinValue: mode === 'track' ? '' : items.find((i) => i.catalogId === catalogId)?.version ?? '' });
      refresh();
    },
    [items, refresh],
  );

  return (
    <section className="library-panel" data-testid="library-panel">
      <header className="library-panel__header">
        <h2 className="library-panel__title">{t('library.title')}</h2>
        <p className="library-panel__sub">{t('library.itemsCount', { count: items.length })}</p>
      </header>

      {items.length === 0 ? (
        <div className="library-panel__empty">{t('library.empty')}</div>
      ) : (
        <div className="library-panel__list">
          {items.map((item) => (
            <LibraryRow
              key={item.catalogId}
              item={item}
              onInsert={() => onInsert(item.catalogId)}
              onUpdate={() => handleUpdate(item)}
              onRemove={() => handleRemove(item.catalogId)}
              onPinMode={(mode) => handlePinMode(item.catalogId, mode)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface LibraryRowProps {
  item: LibraryItem;
  onInsert: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onPinMode: (mode: PinMode) => void;
}

function LibraryRow({ item, onInsert, onUpdate, onRemove, onPinMode }: LibraryRowProps): ReactElement {
  const t = useT();
  const def = getComponent(item.catalogId);
  const latest = getLatestVersion(item.catalogId);
  const hasUpdate = latest && latest !== item.version;
  const isAvailable = !!def;

  return (
    <div className={cn('library-row', !isAvailable && 'library-row--unavailable')}>
      <div className="library-row__thumb">
        {def ? <ComponentThumb def={def} /> : <div className="library-row__missing" />}
      </div>

      <div className="library-row__info">
        <div className="library-row__name">{item.name}</div>
        <div className="library-row__meta">
          <span className="library-row__version">v{item.version}</span>
          {!isAvailable && <span className="library-row__badge library-row__badge--unavailable">{t('library.unavailable')}</span>}
          {hasUpdate && isAvailable && (
            <span className="library-row__badge library-row__badge--update">{t('library.updateAvailable')}</span>
          )}
        </div>

        <div className="library-row__pin">
          <select
            className="library-row__pin-select"
            value={item.pinMode}
            onChange={(e) => onPinMode(e.target.value as PinMode)}
            aria-label={t('library.pinModeLabel')}
          >
            <option value="track">{t('library.pinMode.trackLatest')}</option>
            <option value="pin-version">{t('library.pinMode.pinVersion')}</option>
            <option value="pin-range">{t('library.pinMode.pinRange')}</option>
          </select>
        </div>
      </div>

      <div className="library-row__actions">
        {hasUpdate && isAvailable && (
          <button type="button" className="library-row__btn library-row__btn--update" onClick={onUpdate}>
            {t('library.update')}
          </button>
        )}
        <button type="button" className="library-row__btn" onClick={onInsert} disabled={!isAvailable}>
          {t('app.insert')}
        </button>
        <button type="button" className="library-row__btn library-row__btn--remove" onClick={onRemove}>
          {t('library.remove')}
        </button>
      </div>
    </div>
  );
}
