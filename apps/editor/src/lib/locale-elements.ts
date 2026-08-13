/**
 * Locale elements — per-element locale/unit-format storage.
 *
 * Per Wave 2 §S2.9 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Locale formatting preferences are stored as a JSON bag inside an
 * element's `style` record so they survive CRDT sync alongside other
 * styling. The keys are namespaced with `x-domio:` to avoid colliding
 * with user-supplied style properties.
 *
 * NOT-YET-IMPLEMENTED: a future revision will move the locale config
 * onto the schema as a first-class `element.locale` field; for now
 * this indirection makes that upgrade a one-line change.
 */

import type { Element } from '@domio/schema';

export interface ElementLocaleConfig {
  locale: string;
  style: 'decimal' | 'currency' | 'percent';
  currency?: string;
  decimals?: number;
}

const KEY = 'x-domio:locale';

export function readLocaleConfig(element: Element): ElementLocaleConfig | null {
  const raw = (element.style ?? {})[KEY];
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Partial<ElementLocaleConfig>;
  if (typeof cfg.locale !== 'string') return null;
  if (cfg.style !== 'decimal' && cfg.style !== 'currency' && cfg.style !== 'percent') return null;
  return {
    locale: cfg.locale,
    style: cfg.style,
    ...(typeof cfg.currency === 'string' ? { currency: cfg.currency } : {}),
    ...(typeof cfg.decimals === 'number' ? { decimals: cfg.decimals } : {}),
  };
}

export function writeLocaleConfig(element: Element, cfg: ElementLocaleConfig): Element {
  const style = { ...(element.style ?? {}), [KEY]: cfg };
  return { ...element, style };
}

export function clearLocaleConfig(element: Element): Element {
  if (!element.style) return element;
  const next = { ...element.style };
  delete next[KEY];
  return { ...element, style: next };
}
