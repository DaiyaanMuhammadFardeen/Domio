/**
 * StickersPanel — themed sticker packs for quick insertion.
 */

'use client';

import { useState, useMemo } from 'react';
import type { ReactElement } from 'react';
import { getComponent } from '@domio/components';
import { getStickerPacks } from '../lib/sticker-packs';
import { cn } from '../lib/cn';
import { useT } from '../lib/locale';

interface StickersPanelProps {
  onInsert: (catalogId: string) => void;
}

export function StickersPanel({ onInsert }: StickersPanelProps): ReactElement {
  const t = useT();
  const packs = useMemo(() => getStickerPacks(), []);
  const [activePack, setActivePack] = useState<string>(packs[0]?.id ?? '');

  const currentPack = useMemo(
    () => packs.find((p) => p.id === activePack) ?? packs[0],
    [packs, activePack],
  );

  return (
    <section className="stickers-panel" data-testid="stickers-panel">
      <header className="stickers-panel__header">
        <h2 className="stickers-panel__title">{t('stickers.title')}</h2>
        <p className="stickers-panel__sub">{t('stickers.packsCount', { count: packs.length })}</p>
      </header>

      <div className="stickers-panel__tabs" role="tablist" aria-label={t('stickers.packLabel')}>
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            role="tab"
            aria-selected={pack.id === activePack}
            className={cn('stickers-panel__tab', pack.id === activePack && 'is-active')}
            onClick={() => setActivePack(pack.id)}
          >
            {pack.name}
          </button>
        ))}
      </div>

      {currentPack && (
        <div className="stickers-panel__pack">
          {currentPack.informal && (
            <div className="stickers-panel__note">{t('stickers.informal')}</div>
          )}
          <div className="stickers-panel__grid" data-testid="stickers-grid">
            {currentPack.stickers.map((sticker) => (
              <StickerCard
                key={sticker.catalogId}
                label={sticker.label}
                catalogId={sticker.catalogId}
                onInsert={() => onInsert(sticker.catalogId)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StickerCard({
  label,
  catalogId,
  onInsert,
}: {
  label: string;
  catalogId: string;
  onInsert: () => void;
}): ReactElement {
  const def = getComponent(catalogId);
  return (
    <button
      type="button"
      className="sticker-card"
      onClick={onInsert}
      disabled={!def}
    >
      <span className="sticker-card__label">{label}</span>
      <span className="sticker-card__catalog">{catalogId}</span>
    </button>
  );
}
