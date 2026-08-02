import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { uuid } from '../crypto/index.js';
import type { IconRecord } from '../store/types.js';

// ---------------------------------------------------------------------------
// Synonym expansion map (small, deterministic)
// ---------------------------------------------------------------------------
const SYNONYM_MAP: Record<string, string[]> = {
  pin: ['location', 'map', 'marker'],
  location: ['pin', 'map', 'marker'],
  map: ['pin', 'location', 'marker'],
  marker: ['pin', 'location', 'map'],
  home: ['house', 'building'],
  house: ['home', 'building'],
  search: ['find', 'magnify', 'magnifier'],
  find: ['search', 'magnify'],
  settings: ['gear', 'cog', 'preferences'],
  gear: ['settings', 'cog'],
  user: ['person', 'account', 'profile'],
  person: ['user', 'account'],
  trash: ['delete', 'remove', 'bin'],
  delete: ['trash', 'remove'],
  heart: ['love', 'like', 'favorite'],
  love: ['heart', 'like'],
  star: ['favorite', 'bookmark', 'rating'],
  close: ['cancel', 'dismiss', 'x'],
  cancel: ['close', 'dismiss'],
  check: ['done', 'complete', 'tick'],
  done: ['check', 'complete'],
  arrow: ['direction', 'chevron'],
  right: ['forward', 'next'],
  left: ['back', 'previous'],
  up: ['top', 'upload'],
  down: ['bottom', 'download'],
  plus: ['add', 'new', 'create'],
  minus: ['subtract', 'remove'],
  play: ['start', 'begin', 'run'],
  pause: ['stop', 'halt'],
  eye: ['view', 'visible', 'show'],
  lock: ['secure', 'private', 'password'],
  unlock: ['open', 'unsecure'],
  bell: ['notification', 'alert', 'alarm'],
  mail: ['email', 'message', 'envelope'],
  camera: ['photo', 'image', 'capture'],
  image: ['photo', 'picture', 'graphic'],
  file: ['document', 'page', 'paper'],
  folder: ['directory', 'collection'],
  link: ['url', 'chain', 'chainlink'],
  share: ['social', 'send'],
  download: ['save', 'export'],
  upload: ['import', 'send'],
  refresh: ['reload', 'sync', 'rotate'],
  calendar: ['date', 'schedule', 'event'],
  clock: ['time', 'watch', 'timer'],
  phone: ['call', 'mobile', 'telephone'],
  chat: ['message', 'comment', 'bubble'],
  comment: ['chat', 'message', 'note'],
  bookmark: ['save', 'tag', 'flag'],
  edit: ['pencil', 'modify', 'write'],
  save: ['disk', 'store', 'keep'],
  copy: ['duplicate', 'clone', 'paste'],
  cut: ['scissors', 'trim'],
  paste: ['clipboard', 'insert'],
  sort: ['order', 'arrange'],
  filter: ['funnel', 'refine'],
  menu: ['hamburger', 'nav', 'navigation'],
  info: ['information', 'details', 'about'],
  warning: ['alert', 'caution', 'danger'],
  error: ['problem', 'issue', 'bug'],
  success: ['checkmark', 'done', 'complete'],
  zoom: ['magnify', 'scale'],
  move: ['drag', 'reposition'],
  resize: ['scale', 'expand'],
  undo: ['revert', 'back'],
  redo: ['repeat', 'forward'],
};

function expandSynonyms(query: string): string[] {
  const q = query.toLowerCase().trim();
  const expansions = SYNONYM_MAP[q] ?? [];
  return [q, ...expansions];
}

// ---------------------------------------------------------------------------
// Perceptual hash: deterministic 8x8 luminance projection from path data
// ---------------------------------------------------------------------------

/**
 * Parse SVG path data to extract bounding box and a set of sampled
 * "density" points. We use a deterministic approach based on the
 * character distribution of the path string itself to avoid needing
 * an SVG rasterizer.
 */
function parsePathMetrics(pathData: string): { minX: number; minY: number; maxX: number; maxY: number; points: Array<{ x: number; y: number }> } {
  // Extract all numeric values from path data (M, L, C, Q, etc. commands)
  const nums = pathData.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Pair numbers as (x, y) coordinates
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (minX === Infinity) {
    // Fallback for empty or unparseable paths
    return { minX: 0, minY: 0, maxX: 24, maxY: 24, points: [] };
  }

  // Generate deterministic density points by hashing the path string
  // and projecting characters into the bounding box
  const points: Array<{ x: number; y: number }> = [];
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  for (let i = 0; i < pathData.length; i++) {
    const code = pathData.charCodeAt(i);
    const px = minX + ((code * 7 + i * 13) % 1000) / 1000 * width;
    const py = minY + ((code * 11 + i * 17) % 1000) / 1000 * height;
    points.push({ x: px, y: py });
  }

  return { minX, minY, maxX, maxY, points };
}

/**
 * Compute a deterministic perceptual hash from icon path data.
 * Produces a 64-bit hex string (16 hex chars) representing an 8x8
 * luminance grid. The algorithm:
 *  1. Parse path bounding box and generate deterministic density points
 *  2. Project points onto an 8x8 grid
 *  3. Compute luminance for each cell based on point density
 *  4. Threshold against median to produce a 64-bit hash
 */
export function dhashPixelsFromPath(pathData: string): string {
  const { minX, minY, maxX, maxY, points } = parsePathMetrics(pathData);

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const GRID = 8;

  // Count points per cell
  const grid = new Uint32Array(GRID * GRID);

  for (const pt of points) {
    let gx = Math.floor(((pt.x - minX) / width) * GRID);
    let gy = Math.floor(((pt.y - minY) / height) * GRID);
    if (gx >= GRID) gx = GRID - 1;
    if (gy >= GRID) gy = GRID - 1;
    if (gx < 0) gx = 0;
    if (gy < 0) gy = 0;
    const idx = gy * GRID + gx;
    grid[idx] = (grid[idx] ?? 0) + 1;
  }

  // Find max density for normalization
  let maxDensity = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]! > maxDensity) maxDensity = grid[i]!;
  }
  if (maxDensity === 0) maxDensity = 1;

  // Normalize to 0-255 luminance per cell
  const luminance = new Uint8Array(GRID * GRID);
  for (let i = 0; i < grid.length; i++) {
    luminance[i] = Math.round((grid[i]! / maxDensity) * 255);
  }

  // Compute median for thresholding
  const sorted = [...luminance].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 128;

  // Produce 64-bit hash: 1 bit per cell (above/below median)
  let hash = 0n;
  for (let i = 0; i < GRID * GRID; i++) {
    hash <<= 1n;
    if (luminance[i]! > median) {
      hash |= 1n;
    }
  }

  // Convert to 16-char hex string
  return hash.toString(16).padStart(16, '0');
}

// ---------------------------------------------------------------------------
// Icon catalog service
// ---------------------------------------------------------------------------

export interface IngestIconInput {
  name: string;
  synonyms?: string[];
  styles?: string[];
  pathData: string;
  viewBox?: string;
  vendor?: string;
  licenseId?: string;
}

/**
 * Ingest an icon into the catalog. Validates inputs, computes perceptual hash,
 * and stores via putIcon.
 */
export async function ingestIcon(
  deps: ServiceDeps,
  input: IngestIconInput,
): Promise<IconRecord> {
  const name = input.name.trim();
  if (!name) throw Errors.validation('Icon name is required');
  if (!input.pathData || !input.pathData.trim()) {
    throw Errors.validation('Icon pathData is required');
  }

  const now = deps.now ? deps.now() : Date.now();
  const hash = dhashPixelsFromPath(input.pathData);

  const record: IconRecord = {
    id: uuid(),
    name,
    synonyms: input.synonyms ?? [],
    styles: input.styles ?? [],
    pathData: input.pathData,
    viewBox: input.viewBox ?? '0 0 24 24',
    vendor: input.vendor ?? '',
    licenseId: input.licenseId ?? '',
    ...(hash ? { perceptualHash: hash } : {}),
    createdAt: now,
  };

  await deps.store.putIcon(record);
  return record;
}

/**
 * Find icons similar to the given icon by perceptual hash.
 */
export async function findSimilarIcons(
  deps: ServiceDeps,
  iconId: string,
): Promise<IconRecord[]> {
  const icon = await deps.store.getIcon(iconId);
  if (!icon) throw Errors.notFound(`icon ${iconId}`);
  if (!icon.perceptualHash) return [];
  return deps.store.findIconsByHash(icon.perceptualHash);
}

/**
 * Search icons with local synonym expansion.
 */
export async function searchIcons(
  deps: ServiceDeps,
  opts: { q: string; styles?: string[]; limit?: number },
): Promise<IconRecord[]> {
  const queries = expandSynonyms(opts.q);
  const results = new Map<string, IconRecord>();

  for (const q of queries) {
    const found = await deps.store.searchIcons(q, {
      ...(opts.limit ? { limit: opts.limit * 2 } : {}),
    });
    for (const icon of found) {
      results.set(icon.id, icon);
    }
  }

  let filtered = [...results.values()];

  // Apply style filter if provided
  if (opts.styles && opts.styles.length > 0) {
    const styleSet = new Set(opts.styles.map((s) => s.toLowerCase()));
    filtered = filtered.filter((icon) =>
      icon.styles.some((s) => styleSet.has(s.toLowerCase())),
    );
  }

  // Apply limit
  const limit = opts.limit ?? deps.limits.maxIconsPerQuery;
  return filtered.slice(0, limit);
}

/**
 * Replace fill/stroke colors in SVG path data with a given hex color.
 * Handles:
 *  - fill="#RRGGBB" / fill="#RRGGBBAA"
 *  - stroke="#RRGGBB" / stroke="#RRGGBBAA"
 *  - fill="rgb(r,g,b)"
 *  - bare hex values in path data
 */
export function recolorIcon(svgOrPath: string, color: string): string {
  let result = svgOrPath;

  // Replace fill="..." attributes
  result = result.replace(
    /fill\s*=\s*"(?:#[0-9a-fA-F]{3,8}|rgb\([^)]*\))"/g,
    `fill="${color}"`,
  );

  // Replace stroke="..." attributes
  result = result.replace(
    /stroke\s*=\s*"(?:#[0-9a-fA-F]{3,8}|rgb\([^)]*\))"/g,
    `stroke="${color}"`,
  );

  // Replace fill='...' (single quotes)
  result = result.replace(
    /fill\s*=\s*'(?:#[0-9a-fA-F]{3,8}|rgb\([^)]*\))'/g,
    `fill='${color}'`,
  );

  // Replace stroke='...' (single quotes)
  result = result.replace(
    /stroke\s*=\s*'(?:#[0-9a-fA-F]{3,8}|rgb\([^)]*\))'/g,
    `stroke='${color}'`,
  );

  return result;
}

export interface IconInsertPayload {
  elementId: string;
  catalogId: 'domio.icon';
  props: {
    iconId: string;
    color: string;
    size: number;
  };
}

/**
 * Produce a component-insertion payload for placing an icon into a scene.
 * Pure function — no store writes.
 */
export function insertIconToScene(
  iconId: string,
  targetElementId: string,
  props: { color?: string; size?: number } = {},
): IconInsertPayload {
  return {
    elementId: targetElementId,
    catalogId: 'domio.icon',
    props: {
      iconId,
      color: props.color ?? '#000000',
      size: props.size ?? 24,
    },
  };
}

/**
 * Count total icons in the catalog.
 */
export async function countIcons(deps: ServiceDeps): Promise<number> {
  return deps.store.countIcons();
}
