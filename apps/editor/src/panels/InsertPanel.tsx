/**
 * InsertPanel — Insert → Components / Templates / Sections / Stock /
 * Lottie / Stickers / Icons (Wave 2 §S2.4).
 *
 * Outer tab strip picks the source category; each tab renders its
 * own searchable/filtered grid. The Components subpanel keeps the
 * existing category tabs and adds a variant selector when a
 * component has variants (light/dark, sm/md/lg, etc).
 *
 * Inserting from any tab dispatches the matching handler:
 *   onInsert         → component catalog (single layer)
 *   onInsertSection  → multi-slide section template
 *   onInsertTemplate → full-deck replacement
 *   onInsertStockImage / onInsertLottie → bootstrap seams
 */

'use client';

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  listComponents,
  type DomioComponentDef,
} from '@domio/components';
import { MagicCard } from '../components/ui/magic-card';
import { Marquee } from '../components/ui/marquee';
import { ComponentThumb } from '../components/ComponentThumb';
import { cn } from '../lib/cn';
import { useT } from '../lib/locale';
import {
  searchTemplates,
  TEMPLATES,
  type TemplateDef,
  type UseCase,
} from '../lib/templates';
import {
  SECTION_TEMPLATES,
  searchSections,
  type SectionTemplate,
} from '../lib/sections';
import { searchStock, type StockPhoto } from '../lib/stock';
import { searchLottie, type LottieAnimation } from '../lib/lottie';
import { getStickerPacks } from '../lib/sticker-packs';
import { searchIcons, type IconEntry } from '../lib/icons';

type InsertTab = 'components' | 'templates' | 'sections' | 'stock' | 'lottie' | 'stickers' | 'icons';

const TABS: { id: InsertTab; label: string }[] = [
  { id: 'components', label: 'Components' },
  { id: 'templates', label: 'Templates' },
  { id: 'sections', label: 'Sections' },
  { id: 'stock', label: 'Stock' },
  { id: 'lottie', label: 'Lottie' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'icons', label: 'Icons' },
];

const CATEGORY_LABELS: Record<string, string> = {
  statistics: 'Stats',
  data: 'Data',
  structure: 'Structure',
  people: 'People',
  layout: 'Layout',
};

export interface InsertPanelProps {
  onInsert: (catalogId: string) => void;
  onInsertSection?: ((sectionId: string) => void) | undefined;
  onInsertTemplate?: ((templateId: string) => void) | undefined;
  onInsertStockImage?: ((assetId: string) => void) | undefined;
  onInsertLottie?: ((animationId: string) => void) | undefined;
  onInsertIcon?: ((iconId: string, color: string) => void) | undefined;
  /** Optional icon color when the icons tab inserts an icon. */
  iconColor?: string | undefined;
}

export function InsertPanel(props: InsertPanelProps): ReactElement {
  const t = useT();
  const [tab, setTab] = useState<InsertTab>('components');

  return (
    <section className="insert-panel" data-testid="insert-panel">
      <header className="insert-panel__header">
        <h2 className="insert-panel__title">{t('insert.title')}</h2>
        <p className="insert-panel__sub">{t('insert.sub')}</p>
      </header>

      <div className="insert-panel__tabs" role="tablist" aria-label={t('insert.tabLabel')}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={cn('insert-panel__tab', tab === entry.id && 'is-active')}
            onClick={() => setTab(entry.id)}
            data-testid={`insert-tab-${entry.id}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'components' && <ComponentsTab onInsert={props.onInsert} />}
      {tab === 'templates' && (
        <TemplatesTab onInsertTemplate={props.onInsertTemplate ?? noopTemplate} />
      )}
      {tab === 'sections' && (
        <SectionsTab onInsertSection={props.onInsertSection ?? noopSection} />
      )}
      {tab === 'stock' && (
        <StockTab onInsertStock={props.onInsertStockImage ?? noopStock} />
      )}
      {tab === 'lottie' && (
        <LottieTab onInsertLottie={props.onInsertLottie ?? noopLottie} />
      )}
      {tab === 'stickers' && <StickersTab onInsert={props.onInsert} />}
      {tab === 'icons' && (
        <IconsTab
          onInsertIcon={props.onInsertIcon ?? noopIcon}
          defaultColor={props.iconColor ?? '#E6EDF3'}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Components — search + category + variant selector
// ---------------------------------------------------------------------------

function ComponentsTab({ onInsert }: { onInsert: (catalogId: string) => void }): ReactElement {
  const t = useT();
  const all = useMemo(() => listComponents(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [variantById, setVariantById] = useState<Record<string, string>>({});

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const c of all) seen.add(c.category);
    return [...seen];
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.catalogId.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [all, query, category]);

  const marqueeItems = useMemo(
    () => all.slice(0, 12).map((c) => c.name),
    [all],
  );

  return (
    <>
      <Marquee className="insert-panel__marquee" pauseOnHover>
        {marqueeItems.map((name) => (
          <span key={name} className="insert-panel__marquee-item">
            {name}
          </span>
        ))}
      </Marquee>

      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchComponents')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchComponents')}
      />

      <div className="insert-panel__cats" role="tablist" aria-label={t('insert.category')}>
        <button
          type="button"
          role="tab"
          aria-selected={category === 'all'}
          className={cn('insert-panel__cat', category === 'all' && 'is-active')}
          onClick={() => setCategory('all')}
        >
          {t('insert.all')}
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={cn('insert-panel__cat', category === c && 'is-active')}
            onClick={() => setCategory(c)}
          >
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      <div className="insert-panel__grid" data-testid="insert-grid">
        {filtered.map((def) => (
          <ComponentCard
            key={def.catalogId}
            def={def}
            variant={variantById[def.catalogId] ?? def.defaultVariant}
            onVariantChange={(v) =>
              setVariantById((prev) => ({ ...prev, [def.catalogId]: v }))
            }
            onInsert={() => onInsert(def.catalogId)}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.empty', { query })}</div>
        ) : null}
      </div>
    </>
  );
}

function ComponentCard({
  def,
  variant,
  onVariantChange,
  onInsert,
}: {
  def: DomioComponentDef;
  variant: string;
  onVariantChange: (variant: string) => void;
  onInsert: () => void;
}): ReactElement {
  const t = useT();
  const hasVariants = def.variants.length > 1;
  return (
    <MagicCard className="insert-card">
      <button type="button" className="insert-card__insert" onClick={onInsert}>
        <span className="insert-card__thumb">
          <ComponentThumb def={def} variant={variant} />
        </span>
        <span className="insert-card__meta">
          <span className="insert-card__name">{def.name}</span>
          <span className="insert-card__cat">{CATEGORY_LABELS[def.category] ?? def.category}</span>
        </span>
        <span className="insert-card__action">{t('insert.insert')}</span>
      </button>
      {hasVariants ? (
        <select
          aria-label={t('insert.variantLabel', { name: def.name })}
          className="insert-card__variant"
          value={variant}
          onChange={(e) => onVariantChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          {def.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      ) : null}
    </MagicCard>
  );
}

// ---------------------------------------------------------------------------
// Templates — full-deck gallery with use-case chips
// ---------------------------------------------------------------------------

const USE_CASES: readonly UseCase[] = ['Pitch', 'Board Report', 'QBR', 'All-hands', 'Demo Day', 'Sales', 'Education'];

function TemplatesTab({
  onInsertTemplate,
}: {
  onInsertTemplate: (templateId: string) => void;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [useCase, setUseCase] = useState<UseCase | 'all'>('all');

  const filtered = useMemo(() => {
    let list: readonly TemplateDef[] = searchTemplates(query);
    if (useCase !== 'all') {
      list = list.filter((tpl) => tpl.useCases.includes(useCase));
    }
    return list;
  }, [query, useCase]);

  return (
    <>
      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchTemplates')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchTemplates')}
      />
      <div className="insert-panel__cats" role="tablist" aria-label={t('insert.useCase')}>
        <button
          type="button"
          role="tab"
          aria-selected={useCase === 'all'}
          className={cn('insert-panel__cat', useCase === 'all' && 'is-active')}
          onClick={() => setUseCase('all')}
        >
          {t('insert.all')}
        </button>
        {USE_CASES.map((uc) => (
          <button
            key={uc}
            type="button"
            role="tab"
            aria-selected={useCase === uc}
            className={cn('insert-panel__cat', useCase === uc && 'is-active')}
            onClick={() => setUseCase(uc)}
          >
            {uc}
          </button>
        ))}
      </div>

      <div className="insert-panel__templates" data-testid="insert-templates">
        {filtered.map((tpl) => (
          <TemplateCard key={tpl.id} template={tpl} onInsert={() => onInsertTemplate(tpl.id)} />
        ))}
        {filtered.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.emptyTemplates')}</div>
        ) : null}
      </div>
    </>
  );
}

function TemplateCard({
  template,
  onInsert,
}: {
  template: TemplateDef;
  onInsert: () => void;
}): ReactElement {
  const t = useT();
  return (
    <article className="template-card" data-testid={`template-${template.id}`}>
      <div
        className="template-card__cover"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: template.cover }}
      />
      <div className="template-card__body">
        <h3 className="template-card__name">{template.name}</h3>
        <p className="template-card__desc">{template.description}</p>
        <ul className="template-card__chips" aria-label={t('insert.useCases')}>
          {template.useCases.map((uc) => (
            <li key={uc} className="template-card__chip">{uc}</li>
          ))}
        </ul>
        <button
          type="button"
          className="template-card__cta"
          onClick={onInsert}
          aria-label={t('insert.useTemplate', { name: template.name })}
        >
          {t('insert.useTemplate', { name: template.name })}
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sections — slide-group insertions
// ---------------------------------------------------------------------------

function SectionsTab({
  onInsertSection,
}: {
  onInsertSection: (sectionId: string) => void;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => searchSections(query), [query]);

  return (
    <>
      <p className="insert-panel__hint">{t('insert.sectionHint')}</p>
      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchSections')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchSections')}
      />
      <div className="insert-panel__sections" data-testid="insert-sections">
        {filtered.map((sec) => (
          <SectionCard
            key={sec.id}
            section={sec}
            onInsert={() => onInsertSection(sec.id)}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.emptySections')}</div>
        ) : null}
      </div>
    </>
  );
}

function SectionCard({
  section,
  onInsert,
}: {
  section: SectionTemplate;
  onInsert: () => void;
}): ReactElement {
  const t = useT();
  return (
    <article className="section-card" data-testid={`section-${section.id}`}>
      <div
        className="section-card__cover"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: section.cover }}
      />
      <div className="section-card__body">
        <h3 className="section-card__name">{section.name}</h3>
        <p className="section-card__desc">{section.description}</p>
        <p className="section-card__meta">
          {t('insert.slideCount', { count: section.slideCount })}
        </p>
        <ul className="section-card__tags" aria-label={t('insert.tags')}>
          {section.tags.map((tag) => (
            <li key={tag} className="section-card__tag">{tag}</li>
          ))}
        </ul>
        <button
          type="button"
          className="section-card__cta"
          onClick={onInsert}
          aria-label={t('insert.insertSection', { name: section.name })}
        >
          {t('insert.insertSection', { name: section.name })}
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Stock — bootstrap seam (Unsplash/Pexels) with local fallback
// ---------------------------------------------------------------------------

function StockTab({
  onInsertStock,
}: {
  onInsertStock: (assetId: string) => void;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ photos: readonly StockPhoto[]; fallback: boolean }>({
    photos: [],
    fallback: true,
  });
  const [loading, setLoading] = useState(false);

  useMemo(() => {
    let cancelled = false;
    setLoading(true);
    void searchStock({ query }).then((res) => {
      if (cancelled) return;
      setResult({ photos: res.photos, fallback: res.fallback });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <>
      <p className="insert-panel__hint">{t('insert.stockHint')}</p>
      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchStock')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchStock')}
      />
      {result.fallback && (
        <p className="insert-panel__fallback">{t('insert.stockFallback')}</p>
      )}
      <div className="insert-panel__grid" data-testid="insert-stock-grid">
        {result.photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className="stock-card"
            onClick={() => onInsertStock(photo.id)}
            title={photo.title}
          >
            <span className="stock-card__title">{photo.title}</span>
            <span className="stock-card__attr">{photo.attribution}</span>
          </button>
        ))}
        {loading && (
          <div className="insert-panel__empty">{t('insert.loading')}</div>
        )}
        {!loading && result.photos.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.emptyStock')}</div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lottie — bootstrap seam
// ---------------------------------------------------------------------------

function LottieTab({
  onInsertLottie,
}: {
  onInsertLottie: (animationId: string) => void;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ animations: readonly LottieAnimation[]; fallback: boolean }>({
    animations: [],
    fallback: true,
  });

  useMemo(() => {
    let cancelled = false;
    void searchLottie({ query }).then((res) => {
      if (cancelled) return;
      setResult({ animations: res.animations, fallback: res.fallback });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <>
      <p className="insert-panel__hint">{t('insert.lottieHint')}</p>
      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchLottie')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchLottie')}
      />
      {result.fallback && (
        <p className="insert-panel__fallback">{t('insert.lottieFallback')}</p>
      )}
      <div className="insert-panel__grid" data-testid="insert-lottie-grid">
        {result.animations.map((anim) => (
          <button
            key={anim.id}
            type="button"
            className="lottie-card"
            onClick={() => onInsertLottie(anim.id)}
            aria-label={anim.title}
          >
            <span
              className="lottie-card__thumb"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: anim.thumb }}
            />
            <span className="lottie-card__name">{anim.title}</span>
          </button>
        ))}
        {result.animations.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.emptyLottie')}</div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stickers — themed packs (delegates to existing sticker-packs lib)
// ---------------------------------------------------------------------------

function StickersTab({ onInsert }: { onInsert: (catalogId: string) => void }): ReactElement {
  const t = useT();
  const packs = useMemo(() => getStickerPacks(), []);
  const [activePack, setActivePack] = useState<string>(packs[0]?.id ?? '');
  const currentPack = useMemo(
    () => packs.find((p) => p.id === activePack) ?? packs[0],
    [packs, activePack],
  );

  return (
    <>
      <p className="insert-panel__hint">{t('insert.stickerHint')}</p>
      <div className="insert-panel__cats" role="tablist" aria-label={t('insert.stickerPack')}>
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            role="tab"
            aria-selected={pack.id === activePack}
            className={cn('insert-panel__cat', pack.id === activePack && 'is-active')}
            onClick={() => setActivePack(pack.id)}
          >
            {pack.name}
          </button>
        ))}
      </div>
      {currentPack ? (
        <div className="insert-panel__grid" data-testid="insert-sticker-grid">
          {currentPack.stickers.map((sticker) => (
            <button
              key={sticker.catalogId}
              type="button"
              className="sticker-card"
              onClick={() => onInsert(sticker.catalogId)}
            >
              <span className="sticker-card__label">{sticker.label}</span>
              <span className="sticker-card__catalog">{sticker.catalogId}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Icons — inline SVG library with color picker
// ---------------------------------------------------------------------------

function IconsTab({
  onInsertIcon,
  defaultColor,
}: {
  onInsertIcon: (iconId: string, color: string) => void;
  defaultColor: string;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [color, setColor] = useState(defaultColor);
  const filtered = useMemo(() => searchIcons(query), [query]);

  return (
    <>
      <input
        type="search"
        className="insert-panel__search"
        placeholder={t('insert.searchIcons')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('insert.searchIcons')}
      />
      <div className="insert-panel__colors" role="radiogroup" aria-label={t('insert.iconColor')}>
        {ICON_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            className={cn('insert-panel__swatch', color === c && 'is-active')}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="insert-panel__grid" data-testid="insert-icon-grid">
        {filtered.map((icon) => (
          <IconCard
            key={icon.id}
            icon={icon}
            color={color}
            onInsert={() => onInsertIcon(icon.id, color)}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="insert-panel__empty">{t('insert.emptyIcons', { query })}</div>
        ) : null}
      </div>
    </>
  );
}

const ICON_COLORS = [
  '#E6EDF3', '#58a6ff', '#3fb950', '#f0883e', '#f778ba',
  '#bc8cff', '#ff7b72', '#d2a8ff', '#79c0ff', '#ffa657',
];

function IconCard({
  icon,
  color,
  onInsert,
}: {
  icon: IconEntry;
  color: string;
  onInsert: () => void;
}): ReactElement {
  return (
    <button type="button" className="icon-card" onClick={onInsert} title={icon.name}>
      <svg
        viewBox="0 0 24 24"
        className="icon-card__svg"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={icon.pathData} />
      </svg>
      <span className="icon-card__name">{icon.name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// No-op fallbacks (when the panel is rendered without the matching handler)
// ---------------------------------------------------------------------------

function noopTemplate(_id: string): void {
  /* noop */
}
function noopSection(_id: string): void {
  /* noop */
}
function noopStock(_id: string): void {
  /* noop */
}
function noopLottie(_id: string): void {
  /* noop */
}
function noopIcon(_id: string, _color: string): void {
  /* noop */
}

// Touched for SSR safety — keep the original symbols reachable.
export { TEMPLATES, SECTION_TEMPLATES };
