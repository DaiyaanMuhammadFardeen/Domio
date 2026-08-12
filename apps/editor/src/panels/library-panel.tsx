/**
 * LibraryPanel — Insert → My Library + Team Library tab.
 *
 * Per Wave 2 §S2.6 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Tabs:
 *   - Personal — local + team-pinned items owned by the current author.
 *   - Team     — shared library entries fetched from /v1/library/items.
 *
 * Each row surfaces a `VersionPinBadge` and a `LibraryLockIcon` so
 * designers can see at a glance which items are pinned, which have
 * updates available, and which are brand-locked.
 *
 * Brand-locked items are insert-only: the host may call `onInsert`
 * but the existing brand kits refuse overrides. The panel disables
 * Remove on brand-locked entries.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ReactElement } from 'react';
import { getComponent } from '@domio/components';
import { getLatestVersion } from '../lib/registry-manifest';
import {
  getLibraryItems,
  type LibraryItem,
  type PinMode,
} from '../lib/library';
import { ComponentThumb } from '../components/ComponentThumb';
import {
  listLibraryEntries,
  listUpdateCandidates,
  updateLibraryVersion,
  removeFromLibraryService,
  isBrandLocked,
  type LibraryScope,
  type RemoteLibraryEntry,
} from '../lib/team-library-service';
import { VersionPinBadge } from '../components/library/VersionPinBadge';
import { LibraryLockIcon } from '../components/library/LibraryLockIcon';
import { cn } from '../lib/cn';
import { useT } from '../lib/locale';

type LibraryTab = 'personal' | 'team';

interface LibraryPanelProps {
  onInsert: (catalogId: string) => void;
  /** Optional id for tests. */
  id?: string | undefined;
  /** Read-only disables inserts/removes. */
  readOnly?: boolean | undefined;
  /** Skip the team-library fetch (e.g. in older tenants). */
  disableTeamTab?: boolean | undefined;
}

export function LibraryPanel({
  onInsert,
  id,
  readOnly,
  disableTeamTab,
}: LibraryPanelProps): ReactElement {
  const t = useT();
  const [tab, setTab] = useState<LibraryTab>('personal');
  const [personal, setPersonal] = useState<LibraryItem[]>(() => getLibraryItems());
  const [team, setTeam] = useState<readonly RemoteLibraryEntry[]>([]);
  const [updates, setUpdates] = useState<ReadonlyMap<string, string>>(new Map());
  const [, setTick] = useState(0);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Refresh personal list when tick changes (insert / remove / update).
  const refreshPersonal = useCallback(() => {
    setPersonal(getLibraryItems());
    setTick((x) => x + 1);
  }, []);

  // Pull team library + update candidates when tab opens.
  useEffect(() => {
    if (tab !== 'team') return;
    let cancelled = false;
    setLoadingTeam(true);
    listLibraryEntries('team')
      .then((entries) => {
        if (cancelled) return;
        setTeam(entries);
      })
      .finally(() => {
        if (!cancelled) setLoadingTeam(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    listUpdateCandidates().then(setUpdates).catch(() => undefined);
  }, []);

  const handleUpdate = useCallback(
    async (catalogId: string) => {
      const latest = getLatestVersion(catalogId) ?? updates.get(catalogId);
      if (!latest) return;
      await updateLibraryVersion(catalogId, latest);
      refreshPersonal();
    },
    [updates, refreshPersonal],
  );

  const handleRemove = useCallback(
    async (catalogId: string) => {
      if (await isBrandLocked(catalogId)) return;
      await removeFromLibraryService(catalogId);
      refreshPersonal();
    },
    [refreshPersonal],
  );

  const handlePinMode = useCallback(
    (catalogId: string, mode: PinMode) => {
      const existing = personal.find((i) => i.catalogId === catalogId);
      const updatesPatch: Partial<LibraryItem> = {
        pinMode: mode,
        pinValue: mode === 'track' ? '' : existing?.pinValue ?? existing?.version ?? '',
      };
      // Defer to the local module
      import('../lib/library').then((m) => {
        m.updateLibraryItem(catalogId, updatesPatch);
        refreshPersonal();
      });
    },
    [personal, refreshPersonal],
  );

  const items = tab === 'personal'
    ? personal.map((item) => ({
        catalogId: item.catalogId,
        item,
        update: updates.get(item.catalogId),
        latest: getLatestVersion(item.catalogId),
      }))
    : team.map((entry) => ({
        catalogId: entry.catalogId,
        entry,
        update: updates.get(entry.catalogId),
        latest: entry.latestVersion,
      }));

  return (
    <section className="library-panel" data-testid={id ?? 'library-panel'}>
      <header className="library-panel__header">
        <h2 className="library-panel__title">{t('library.title')}</h2>
        <p className="library-panel__sub">{t('library.itemsCount', { count: items.length })}</p>
      </header>

      <nav className="library-panel__tabs" role="tablist" aria-label="Library tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={cn('library-panel__tab', tab === 'personal' && 'is-active')}
          onClick={() => setTab('personal')}
          data-testid="library-tab-personal"
        >
          Personal
        </button>
        {!disableTeamTab && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'team'}
            className={cn('library-panel__tab', tab === 'team' && 'is-active')}
            onClick={() => setTab('team')}
            data-testid="library-tab-team"
          >
            Team
          </button>
        )}
      </nav>

      {items.length === 0 ? (
        <div className="library-panel__empty">{t('library.empty')}</div>
      ) : (
        <div className="library-panel__list" data-testid={`library-list-${tab}`}>
          {tab === 'personal'
            ? personal.map((item) => (
                <PersonalRow
                  key={item.catalogId}
                  item={item}
                  latest={getLatestVersion(item.catalogId)}
                  remoteLatest={updates.get(item.catalogId)}
                  onInsert={() => onInsert(item.catalogId)}
                  onUpdate={() => void handleUpdate(item.catalogId)}
                  onRemove={() => void handleRemove(item.catalogId)}
                  onPinMode={(mode) => handlePinMode(item.catalogId, mode)}
                  disabledInsert={readOnly}
                />
              ))
            : team.map((entry) => (
                <TeamRow
                  key={entry.catalogId}
                  entry={entry}
                  onInsert={() => onInsert(entry.catalogId)}
                  disabledInsert={readOnly}
                />
              ))}
        </div>
      )}

      {loadingTeam && tab === 'team' && (
        <div className="library-panel__loading" data-testid="library-team-loading">
          Loading team library…
        </div>
      )}
    </section>
  );
}

interface PersonalRowProps {
  item: LibraryItem;
  latest: string | undefined;
  remoteLatest: string | undefined;
  onInsert: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onPinMode: (mode: PinMode) => void;
  disabledInsert?: boolean | undefined;
}

function PersonalRow({
  item,
  latest,
  remoteLatest,
  onInsert,
  onUpdate,
  onRemove,
  onPinMode,
  disabledInsert,
}: PersonalRowProps): ReactElement {
  const t = useT();
  const def = getComponent(item.catalogId);
  const isAvailable = !!def;
  const latestAvailable = remoteLatest ?? latest;
  const hasUpdate = !!latestAvailable && latestAvailable !== item.version;

  return (
    <div
      className={cn('library-row', !isAvailable && 'library-row--unavailable')}
      data-testid={`library-row-${item.catalogId}`}
    >
      <div className="library-row__thumb">
        {def ? <ComponentThumb def={def} /> : <div className="library-row__missing" />}
      </div>

      <div className="library-row__info">
        <div className="library-row__name">
          {item.name}
          <LibraryLockIcon id={`library-lock-${item.catalogId}`} locked={false} />
        </div>
        <div className="library-row__meta">
          <span className="library-row__version">v{item.version}</span>
          <VersionPinBadge
            pinMode={item.pinMode}
            pinValue={item.pinValue}
            installedVersion={item.version}
            latestVersion={hasUpdate ? latestAvailable : undefined}
            onUpdate={onUpdate}
          />
          {!isAvailable && (
            <span className="library-row__badge library-row__badge--unavailable">
              {t('library.unavailable')}
            </span>
          )}
        </div>

        <div className="library-row__pin">
          <select
            className="library-row__pin-select"
            value={item.pinMode}
            onChange={(e) => onPinMode(e.target.value as PinMode)}
            disabled={disabledInsert}
            aria-label={t('library.pinModeLabel')}
            data-testid={`library-pin-${item.catalogId}`}
          >
            <option value="track">{t('library.pinMode.trackLatest')}</option>
            <option value="pin-version">{t('library.pinMode.pinVersion')}</option>
            <option value="pin-range">{t('library.pinMode.pinRange')}</option>
          </select>
        </div>
      </div>

      <div className="library-row__actions">
        {hasUpdate && isAvailable && (
          <button
            type="button"
            className="library-row__btn library-row__btn--update"
            onClick={onUpdate}
            data-testid={`library-update-${item.catalogId}`}
          >
            {t('library.update')}
          </button>
        )}
        <button
          type="button"
          className="library-row__btn"
          onClick={onInsert}
          disabled={disabledInsert || !isAvailable}
          data-testid={`library-insert-${item.catalogId}`}
        >
          {t('app.insert')}
        </button>
        <button
          type="button"
          className="library-row__btn library-row__btn--remove"
          onClick={onRemove}
          disabled={disabledInsert}
          data-testid={`library-remove-${item.catalogId}`}
        >
          {t('library.remove')}
        </button>
      </div>
    </div>
  );
}

interface TeamRowProps {
  entry: RemoteLibraryEntry;
  onInsert: () => void;
  disabledInsert?: boolean | undefined;
}

function TeamRow({ entry, onInsert, disabledInsert }: TeamRowProps): ReactElement {
  const def = getComponent(entry.catalogId);
  const isAvailable = !!def;
  const hasUpdate = !!entry.latestVersion && entry.latestVersion !== entry.version;
  return (
    <div
      className={cn('library-row', !isAvailable && 'library-row--unavailable')}
      data-testid={`library-team-row-${entry.catalogId}`}
    >
      <div className="library-row__thumb">
        {def ? <ComponentThumb def={def} /> : <div className="library-row__missing" />}
      </div>
      <div className="library-row__info">
        <div className="library-row__name">
          {entry.name}
          <LibraryLockIcon id={`library-lock-${entry.catalogId}`} locked={entry.brandLocked} />
        </div>
        <div className="library-row__meta">
          <span className="library-row__version">v{entry.version}</span>
          <VersionPinBadge
            pinMode="track"
            installedVersion={entry.version}
            latestVersion={hasUpdate ? entry.latestVersion : undefined}
          />
          {entry.brandLocked && (
            <span className="library-row__badge library-row__badge--locked">brand-locked</span>
          )}
        </div>
      </div>
      <div className="library-row__actions">
        <button
          type="button"
          className="library-row__btn"
          onClick={onInsert}
          disabled={disabledInsert || !isAvailable}
          data-testid={`library-insert-${entry.catalogId}`}
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// Re-export the scope for hosts that want to pass the prop explicitly.
export type { LibraryScope };
