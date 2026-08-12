/**
 * Lottie animations — bootstrap seam for the Insert → Lottie panel.
 *
 * Per Wave 2 §S2.4 of docs/frontend-roadmap/02-wave-editor-surface.md:
 *   "Lottie"
 *
 * The real implementation would defer to lottieFiles via fetch
 * (returning Lottie JSON by URL). Until the backend is wired, this
 * module ships a curated local catalog of Lottie-style animations
 * represented as inline SVG paths, so the panel is usable in
 * editor-only mode. The fetch API is documented below as a
 * NOT-YET-IMPLEMENTED seam so the next backend worker can drop in
 * a real client without touching the InsertPanel.
 */

export interface LottieAnimation {
  id: string;
  title: string;
  /** Inline SVG used as a placeholder thumbnail. Real entries would render the Lottie JSON via lottie-web. */
  thumb: string;
  /** The animation JSON URL — null in the local fallback. */
  jsonUrl: string | null;
  /** Author attribution. */
  author: string;
  /** Tags for search. */
  tags: readonly string[];
}

export const LOTTIE_ANIMATIONS: readonly LottieAnimation[] = [
  {
    id: 'checkmark-success',
    title: 'Checkmark success',
    thumb: `
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="44" fill="none" stroke="#5b73ff" stroke-width="6" stroke-dasharray="276" stroke-dashoffset="0"/>
        <path d="M40 62 L55 78 L82 48" fill="none" stroke="#5b73ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    jsonUrl: null,
    author: 'Curated',
    tags: ['success', 'check', 'confirm'],
  },
  {
    id: 'loading-spinner',
    title: 'Loading spinner',
    thumb: `
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="40" fill="none" stroke="#dde3ee" stroke-width="8"/>
        <path d="M60 20 A40 40 0 0 1 100 60" fill="none" stroke="#5b73ff" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `,
    jsonUrl: null,
    author: 'Curated',
    tags: ['loading', 'spinner', 'wait'],
  },
  {
    id: 'pulse-heart',
    title: 'Pulse heart',
    thumb: `
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 100 L26 60 A20 20 0 0 1 60 36 A20 20 0 0 1 94 60 Z" fill="#ff6b6b"/>
      </svg>
    `,
    jsonUrl: null,
    author: 'Curated',
    tags: ['heart', 'love', 'pulse'],
  },
  {
    id: 'confetti',
    title: 'Confetti',
    thumb: `
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="20" width="8" height="14" rx="2" fill="#5b73ff" transform="rotate(20 34 27)"/>
        <rect x="60" y="30" width="8" height="14" rx="2" fill="#ff6b6b" transform="rotate(-15 64 37)"/>
        <rect x="84" y="40" width="8" height="14" rx="2" fill="#28a745" transform="rotate(45 88 47)"/>
        <rect x="40" y="70" width="8" height="14" rx="2" fill="#ffc107" transform="rotate(-30 44 77)"/>
      </svg>
    `,
    jsonUrl: null,
    author: 'Curated',
    tags: ['celebrate', 'confetti', 'party'],
  },
  {
    id: 'arrow-bounce',
    title: 'Bounce arrow',
    thumb: `
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 70 L60 90 L90 70" fill="none" stroke="#5b73ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    jsonUrl: null,
    author: 'Curated',
    tags: ['arrow', 'down', 'bounce'],
  },
];

export interface LottieSearchOptions {
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface LottieSearchResult {
  animations: readonly LottieAnimation[];
  total: number;
  page: number;
  pageSize: number;
  /** True when the local fallback is being used. */
  fallback: boolean;
}

/**
 * Search the Lottie animation catalog.
 *
 * NOT-YET-IMPLEMENTED: replace the body of this function with a fetch
 * to lottieFiles or services/media-index. The InsertPanel already
 * handles the `fallback` flag for graceful degradation.
 */
export async function searchLottie(options: LottieSearchOptions = {}): Promise<LottieSearchResult> {
  const { query = '', page = 1, pageSize = 50 } = options;
  const q = query.trim().toLowerCase();
  let filtered: readonly LottieAnimation[] = LOTTIE_ANIMATIONS;
  if (q) {
    filtered = filtered.filter(
      (a) => a.title.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    animations: filtered.slice(start, end),
    total: filtered.length,
    page,
    pageSize,
    fallback: true,
  };
}
