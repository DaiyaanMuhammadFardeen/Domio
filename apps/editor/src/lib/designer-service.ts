/**
 * Designer service — typed client for the AI slide designer endpoints.
 *
 * Per Wave 6 §S6.3 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md:
 *   "Designer panel: prompt → 4 layout options in current theme.
 *    Apply inserts slides. Redesign: select slide → light/full redesign."
 *
 * Exposes typed wrappers for:
 *   - POST /v1/ai/designer/layouts
 *   - POST /v1/ai/designer/redesign
 *
 * Today the implementation returns deterministic offline fallbacks so
 * the UI is fully verifiable without the AI backend. When the
 * `ai/designer` worker lands in a later wave, the request bodies and
 * response shapes stay identical — only the implementation swaps.
 */

import { BOOTSTRAP_THEMES, type ThemeBootstrap } from './theme-bootstrap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LayoutKind =
  | 'title-hero'
  | 'data-focus'
  | 'chart-with-caption'
  | 'two-column'
  | 'bullets'
  | 'summary';

export interface LayoutDescriptor {
  readonly id: string;
  readonly kind: LayoutKind;
  readonly title: string;
  readonly caption: string;
  readonly blocks: readonly string[];
  readonly dataFocus: boolean;
  readonly accentSlot: 'left' | 'right' | 'top' | 'bottom';
}

export interface GenerateLayoutsRequest {
  readonly prompt: string;
  /** Optional theme id to honor when generating layouts (brand-lock). */
  readonly themeId?: string;
  /** Optional brand kit id to confine colors and typography to. */
  readonly brandKitId?: string;
}

export interface GenerateLayoutsResult {
  readonly layouts: readonly LayoutDescriptor[];
  readonly theme: ThemeBootstrap;
  /** True when the live service call succeeded; false on fallback. */
  readonly live: boolean;
}

export type RedesignMode = 'light' | 'full';

export interface RedesignRequest {
  readonly slideId: string;
  readonly mode: RedesignMode;
  readonly themeId?: string;
  readonly brandKitId?: string;
  /** Optional current content used to preserve meaning during light mode. */
  readonly currentContent?: readonly string[];
}

export interface RedesignSlide {
  readonly id: string;
  readonly kind: LayoutKind;
  readonly title: string;
  readonly caption: string;
  readonly blocks: readonly string[];
}

export interface RedesignResult {
  readonly originalSlideId: string;
  readonly mode: RedesignMode;
  readonly redesign: RedesignSlide;
  readonly theme: ThemeBootstrap;
  readonly brandLocked: boolean;
  readonly live: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KINDS: readonly LayoutKind[] = [
  'title-hero',
  'data-focus',
  'chart-with-caption',
  'two-column',
  'bullets',
  'summary',
];

const KIND_TITLES: Record<LayoutKind, string> = {
  'title-hero': 'Title Hero',
  'data-focus': 'Data Focus',
  'chart-with-caption': 'Chart + Caption',
  'two-column': 'Two Column',
  bullets: 'Bullet Stack',
  summary: 'Summary',
};

const KIND_BLOCKS: Record<LayoutKind, readonly string[]> = {
  'title-hero': ['Headline', 'Subhead', 'Audience & context'],
  'data-focus': ['KPI tile', 'KPI tile', 'Trend chart', 'Footnote'],
  'chart-with-caption': ['Hero chart', 'Caption paragraph', 'Source line'],
  'two-column': ['Left column', 'Right column'],
  bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3', 'Bullet 4'],
  summary: ['TL;DR', 'Key takeaways', 'Next steps'],
};

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function firstAvailableTheme(): ThemeBootstrap {
  return BOOTSTRAP_THEMES[0]!;
}

function pickKinds(seed: number): readonly LayoutKind[] {
  // Select 4 distinct kinds deterministically based on the seed.
  const result: LayoutKind[] = [];
  for (let i = 0; i < KINDS.length && result.length < 4; i++) {
    const idx = (seed + i * 7) % KINDS.length;
    const k = KINDS[idx]!;
    if (!result.includes(k)) result.push(k);
  }
  // Always guarantee 4 entries (fall back to cycling if seeded collisions).
  let i = 0;
  while (result.length < 4 && i < KINDS.length * 2) {
    const k = KINDS[(seed + i) % KINDS.length]!;
    if (!result.includes(k)) result.push(k);
    i++;
  }
  return result;
}

function accentFor(kind: LayoutKind): LayoutDescriptor['accentSlot'] {
  switch (kind) {
    case 'title-hero':
      return 'top';
    case 'two-column':
      return 'left';
    case 'data-focus':
      return 'right';
    case 'chart-with-caption':
      return 'bottom';
    default:
      return 'top';
  }
}

function buildLayout(id: string, kind: LayoutKind, prompt: string): LayoutDescriptor {
  return {
    id,
    kind,
    title: KIND_TITLES[kind],
    caption: `Generated for "${prompt.slice(0, 48)}${prompt.length > 48 ? '…' : ''}"`,
    blocks: KIND_BLOCKS[kind],
    dataFocus: kind === 'data-focus' || kind === 'chart-with-caption',
    accentSlot: accentFor(kind),
  };
}

// ---------------------------------------------------------------------------
// generateLayouts
// ---------------------------------------------------------------------------

/**
 * Request 4 layout options for the given prompt. The implementation
 * today returns deterministic offline fallbacks; the request shape
 * matches the live endpoint.
 */
export async function generateLayouts(req: GenerateLayoutsRequest): Promise<GenerateLayoutsResult> {
  const prompt = req.prompt.trim() || 'Untitled deck';
  const seed = hash(prompt) + (req.themeId?.length ?? 0);
  const kinds = pickKinds(seed);
  const layouts: LayoutDescriptor[] = kinds.map((kind, i) =>
    buildLayout(`layout-${seed.toString(36)}-${i}`, kind, prompt),
  );

  const theme: ThemeBootstrap =
    BOOTSTRAP_THEMES.find((t) => t.id === req.themeId) ?? firstAvailableTheme();

  return { layouts, theme, live: false };
}

// ---------------------------------------------------------------------------
// redesignSlide
// ---------------------------------------------------------------------------

/**
 * Generate a redesigned slide that respects brand-lock. Light mode
 * preserves the slide's existing content (typography + density only);
 * full mode can re-suggest titles while keeping brand constraints.
 */
export async function redesignSlide(req: RedesignRequest): Promise<RedesignResult> {
  const seed = hash(req.slideId + req.mode);
  const kind = KINDS[seed % KINDS.length]!;
  const preservedContent = req.currentContent ?? [];

  const blocks =
    req.mode === 'light'
      ? preservedContent.length > 0
        ? preservedContent
        : KIND_BLOCKS[kind]
      : KIND_BLOCKS[kind];

  const redesign: RedesignSlide = {
    id: `redesign-${req.slideId}-${seed.toString(36)}`,
    kind,
    title:
      req.mode === 'light'
        ? (preservedContent[0] ?? 'Untitled slide')
        : `${KIND_TITLES[kind]} — refined`,
    caption:
      req.mode === 'light'
        ? 'Density + typography adjusted to brand tokens.'
        : 'Rebuilt with current brand-kit palette + spacing scale.',
    blocks,
  };

  const theme: ThemeBootstrap =
    BOOTSTRAP_THEMES.find((t) => t.id === req.themeId) ?? firstAvailableTheme();

  return {
    originalSlideId: req.slideId,
    mode: req.mode,
    redesign,
    theme,
    brandLocked: true,
    live: false,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap default layouts — used by DesignerPanel when no prompt has
// been run yet but the user wants to see what options look like.
// ---------------------------------------------------------------------------

export const BOOTSTRAP_LAYOUTS: readonly LayoutDescriptor[] = KINDS.slice(0, 4).map((kind, i) =>
  buildLayout(`bootstrap-${i}`, kind, 'Bootstrap preview'),
);
