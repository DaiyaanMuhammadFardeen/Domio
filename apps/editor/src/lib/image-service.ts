/**
 * Image service — typed client for /v1/ai/image and background removal.
 *
 * Per Wave 6 §S6.5 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Wraps:
 *  - `POST /v1/ai/image` for AI image generation (returns 4 candidates).
 *  - `POST /v1/ai/image/{id}/remove-background` for background removal.
 *
 * Each endpoint has a deterministic bootstrap fallback so the editor
 * stays usable when the backend is offline. The fallback returns SVG
 * data URLs so candidates remain visually meaningful even without
 * network access.
 */

const DEFAULT_API_BASE = 'http://localhost:8080';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

export const AI_IMAGE_STYLES = ['photorealistic', 'illustration', 'minimal', 'watercolor'] as const;
export type AiImageStyle = (typeof AI_IMAGE_STYLES)[number];

export interface AiImageStyleOption {
  readonly id: AiImageStyle;
  readonly label: string;
}

export const AI_IMAGE_STYLE_OPTIONS: ReadonlyArray<AiImageStyleOption> = [
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'watercolor', label: 'Watercolor' },
];

// ─── Image generation ────────────────────────────────────────────────────────

export interface AiImageGenerationRequest {
  /** The positive prompt describing the desired image. */
  prompt: string;
  /** Optional negative prompt to steer away from unwanted elements. */
  negativePrompt?: string;
  /** Style preset that controls the rendering pipeline. */
  style: AiImageStyle;
  /** Number of candidate images to generate. Capped at 4 by the backend. */
  count?: number;
}

export interface AiImageCandidate {
  readonly id: string;
  /** Direct URL (or data URL) of the generated candidate. */
  readonly url: string;
  /** Optional thumbnail for grid display. */
  readonly thumbnailUrl?: string;
  /** Style used to generate this candidate. */
  readonly style: AiImageStyle;
  /** Provenance metadata for the AI-generated asset. */
  readonly provenance: {
    readonly model: string;
    readonly seed: number;
    readonly generatedAtMs: number;
  };
}

export interface AiImageGenerationResult {
  readonly candidates: ReadonlyArray<AiImageCandidate>;
  /** The prompt echoed back for confirmation in the UI. */
  readonly prompt: string;
  /** The style echoed back for confirmation in the UI. */
  readonly style: AiImageStyle;
}

/**
 * Generate up to 4 image candidates for the given prompt + style.
 * Falls back to a deterministic SVG placeholder set when offline.
 */
export async function generateImages(
  req: AiImageGenerationRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<AiImageGenerationResult> {
  try {
    return await postJson<AiImageGenerationResult>(`${baseUrl}/v1/ai/image`, {
      prompt: req.prompt,
      negativePrompt: req.negativePrompt ?? '',
      style: req.style,
      count: req.count ?? 4,
    });
  } catch {
    const candidates = bootstrapCandidates(req.prompt, req.style, req.count ?? 4);
    return { candidates, prompt: req.prompt, style: req.style };
  }
}

function bootstrapCandidates(
  prompt: string,
  style: AiImageStyle,
  count: number,
): ReadonlyArray<AiImageCandidate> {
  const safeCount = Math.min(4, Math.max(1, count));
  const seed = hashSeed(prompt, style);
  const out: AiImageCandidate[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    const palette = bootstrapPalette(style, seed + i);
    out.push({
      id: `ai-img-${seed}-${i}`,
      url: placeholderSvg(prompt, style, palette, i),
      thumbnailUrl: placeholderSvg(prompt, style, palette, i, 240, 160),
      style,
      provenance: {
        model: 'bootstrap-placeholder',
        seed: seed + i,
        generatedAtMs: Date.now(),
      },
    });
  }
  return out;
}

function hashSeed(prompt: string, style: string): number {
  let h = 2166136261;
  const text = `${prompt}|${style}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function bootstrapPalette(style: AiImageStyle, seed: number): readonly string[] {
  const palettes: Record<AiImageStyle, readonly string[]> = {
    photorealistic: ['var(--surface-base)', 'var(--surface-raised)', 'var(--accent)'],
    illustration: ['var(--accent)', 'var(--surface-raised)', 'var(--surface-base)'],
    minimal: ['var(--surface-base)', 'var(--muted)', 'var(--accent)'],
    watercolor: ['var(--accent)', 'var(--surface-raised)', 'var(--muted)'],
  };
  const base = palettes[style];
  const offset = seed % base.length;
  return [base[offset]!, base[(offset + 1) % base.length]!, base[(offset + 2) % base.length]!];
}

function placeholderSvg(
  prompt: string,
  style: AiImageStyle,
  palette: readonly string[],
  index: number,
  width: number = 480,
  height: number = 320,
): string {
  const [bg, accent, accent2] = palette;
  const label = `${truncate(prompt, 32)} · ${style} · ${index + 1}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' width='${width}' height='${height}'><rect width='${width}' height='${height}' fill='${bg}'/><circle cx='${width * 0.25}' cy='${height * 0.4}' r='${height * 0.2}' fill='${accent}' opacity='0.6'/><circle cx='${width * 0.7}' cy='${height * 0.6}' r='${height * 0.15}' fill='${accent2}' opacity='0.5'/><text x='${width / 2}' y='${height - 24}' font-family='sans-serif' font-size='14' fill='var(--fg, #e5e7eb)' text-anchor='middle'>${escapeXml(label)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

// ─── Background removal ──────────────────────────────────────────────────────

export interface RemoveBackgroundResult {
  /** ID of the new image (background-removed variant). */
  readonly id: string;
  /** URL of the background-removed image. */
  readonly url: string;
  /** Original image ID this was derived from. */
  readonly sourceId: string;
  /** Provenance metadata for the AI transformation. */
  readonly provenance: {
    readonly model: string;
    readonly transformedAtMs: number;
  };
}

/**
 * Remove the background from an existing image. Returns a new image
 * ID and URL pointing at the cut-out. Falls back to a transparent SVG
 * when offline.
 */
export async function removeImageBackground(
  imageId: string,
  sourceUrl: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<RemoveBackgroundResult> {
  try {
    return await postJson<RemoveBackgroundResult>(
      `${baseUrl}/v1/ai/image/${encodeURIComponent(imageId)}/remove-background`,
      { sourceId: imageId, sourceUrl },
    );
  } catch {
    const id = `ai-img-nobg-${hashSeed(imageId, 'bg')}`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 320' width='480' height='320'><rect width='480' height='320' fill='none'/><circle cx='240' cy='160' r='80' fill='var(--accent)' opacity='0.7'/><text x='240' y='300' font-family='sans-serif' font-size='12' fill='var(--muted, #6b7280)' text-anchor='middle'>background removed</text></svg>`;
    return {
      id,
      url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      sourceId: imageId,
      provenance: {
        model: 'bootstrap-cutout',
        transformedAtMs: Date.now(),
      },
    };
  }
}