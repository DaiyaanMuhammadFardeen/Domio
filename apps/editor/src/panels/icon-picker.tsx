/**
 * IconPicker — searchable icon picker with color recoloring.
 * Trigger from Insert tab; inserts domio.icon component elements.
 */

'use client';

import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { searchIcons, ICONS, type IconEntry } from '../lib/icons';
import { cn } from '../lib/cn';
import { useT } from '../lib/locale';

const PRESET_COLORS = [
  '#E6EDF3',
  '#58a6ff',
  '#3fb950',
  '#f0883e',
  '#f778ba',
  '#bc8cff',
  '#ff7b72',
  '#d2a8ff',
  '#79c0ff',
  '#ffa657',
];

interface IconPickerProps {
  onInsert: (iconId: string, color: string) => void;
}

export function IconPicker({ onInsert }: IconPickerProps): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]!);

  const filtered = useMemo(() => searchIcons(query), [query]);

  return (
    <section className="icon-picker" data-testid="icon-picker">
      <header className="icon-picker__header">
        <h2 className="icon-picker__title">{t('icons.title')}</h2>
        <p className="icon-picker__sub">{t('icons.count', { count: ICONS.length })}</p>
      </header>

      <input
        type="search"
        className="icon-picker__search"
        placeholder={t('icons.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('icons.searchPlaceholder')}
      />

      <div className="icon-picker__colors" role="radiogroup" aria-label={t('icons.color')}>
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={color === selectedColor}
            className={cn('icon-picker__swatch', color === selectedColor && 'is-active')}
            style={{ backgroundColor: color }}
            onClick={() => setSelectedColor(color)}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      <div className="icon-picker__grid" data-testid="icon-grid">
        {filtered.map((icon) => (
          <IconCard
            key={icon.id}
            icon={icon}
            color={selectedColor}
            onInsert={() => onInsert(icon.id, selectedColor)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="icon-picker__empty">No icons match &quot;{query}&quot;.</div>
        )}
      </div>
    </section>
  );
}

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
      >
        <path d={icon.pathData} />
      </svg>
      <span className="icon-card__name">{icon.name}</span>
    </button>
  );
}
