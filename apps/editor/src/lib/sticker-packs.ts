/**
 * Sticker packs — themed sets of component catalogIds for the Stickers panel.
 * Clicking a sticker inserts it as a component element on the active slide.
 */

export interface StickerPack {
  id: string;
  name: string;
  informal?: boolean;
  stickers: StickerEntry[];
}

export interface StickerEntry {
  catalogId: string;
  label: string;
}

export const STICKER_PACKS: readonly StickerPack[] = [
  {
    id: 'emoji',
    name: 'Emoji',
    informal: true,
    stickers: [
      { catalogId: 'domio.bullet-list', label: 'Checkmark List' },
      { catalogId: 'domio.badges', label: 'Status Badges' },
      { catalogId: 'domio.callout', label: 'Callout Bubble' },
    ],
  },
  {
    id: 'arrows',
    name: 'Arrows & Callouts',
    stickers: [
      { catalogId: 'domio.callout', label: 'Callout' },
      { catalogId: 'domio.quote-block', label: 'Quote Arrow' },
      { catalogId: 'domio.numbered-steps', label: 'Step Flow' },
    ],
  },
  {
    id: 'zap',
    name: 'Zap',
    stickers: [
      { catalogId: 'domio.kpi-trio', label: 'KPI Trio' },
      { catalogId: 'domio.progress-card', label: 'Progress' },
      { catalogId: 'domio.section-header', label: 'Section' },
    ],
  },
];

export function getStickerPacks(): readonly StickerPack[] {
  return STICKER_PACKS;
}

export function findStickerByCatalogId(catalogId: string): { pack: StickerPack; sticker: StickerEntry } | undefined {
  for (const pack of STICKER_PACKS) {
    const sticker = pack.stickers.find((s) => s.catalogId === catalogId);
    if (sticker) return { pack, sticker };
  }
  return undefined;
}
