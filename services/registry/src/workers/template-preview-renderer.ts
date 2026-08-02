/**
 * Template preview renderer worker — builds a poster SVG and frame spec
 * for a given template.
 *
 * This worker does NOT encode to video/MP4.  Frame encoding is a downstream
 * responsibility.  It produces:
 *  - The poster SVG (all slides stacked vertically)
 *  - A frames spec array: slide index → duration in ms
 */

import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { renderDeckPoster, renderSlidePreviews } from '../templates/svg-renderer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutputKind = 'poster' | 'slides';

export interface WorkerInput {
  templateId: string;
  outputKind?: OutputKind;
}

export interface FrameSpec {
  slideIndex: number;
  durationMs: number;
}

export interface WorkerResult {
  /** The rendered SVG string (poster or per-slide). */
  svg: string;
  /** Frame specification — slide index → duration ms. */
  frames: FrameSpec[];
  /** Width of the rendered SVG (px). */
  width: number;
  /** Height of the rendered SVG (px). */
  height: number;
  /** Total number of text placeholder elements found. */
  placeholderCount: number;
}

const DEFAULT_FRAME_DURATION_MS = 5000;

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Run the template preview renderer for a single template.
 *
 * NOTE: This worker returns raw SVG + frame specs.  Encoding the frames into
 * an MP4 video is a separate downstream worker that consumes `frames` to
 * extract individual slide images and pipe them through ffmpeg (or similar).
 */
export async function run(
  deps: ServiceDeps,
  input: WorkerInput,
): Promise<WorkerResult> {
  const template = await deps.store.getTemplate(input.templateId);
  if (!template) throw Errors.notFound(`template ${input.templateId}`);

  const deckJson = template.deckJson;
  if (!deckJson || typeof deckJson !== 'object') {
    throw Errors.validation('Template has no deckJson');
  }

  const outputKind = input.outputKind ?? 'poster';

  if (outputKind === 'slides') {
    const slideSvgs = renderSlidePreviews(deckJson as Record<string, unknown>);
    const frames: FrameSpec[] = slideSvgs.map((_, i) => ({
      slideIndex: i,
      durationMs: DEFAULT_FRAME_DURATION_MS,
    }));

    // Use the first slide SVG for the top-level svg field; callers can
    // iterate frames for individual slides.
    return {
      svg: slideSvgs[0] ?? '',
      frames,
      width: 1920,
      height: 1080,
      placeholderCount: countTextElements(deckJson as Record<string, unknown>),
    };
  }

  // Default: poster
  const result = renderDeckPoster(deckJson as Record<string, unknown>);

  const slideCount = ((deckJson as { slides?: unknown[] }).slides ?? []).length;
  const frames: FrameSpec[] = Array.from({ length: slideCount }, (_, i) => ({
    slideIndex: i,
    durationMs: DEFAULT_FRAME_DURATION_MS,
  }));

  return {
    svg: result.svg,
    frames,
    width: result.width,
    height: result.height,
    placeholderCount: result.placeholderCount,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTextElements(deckJson: Record<string, unknown>): number {
  const slides = (deckJson as { slides?: Array<{ elements?: Array<{ type: string }> }> }).slides ?? [];
  let count = 0;
  for (const slide of slides) {
    for (const el of slide.elements ?? []) {
      if (el.type === 'text') count++;
    }
  }
  return count;
}
