/**
 * podcast-export-service — deck-to-podcast generator and TTS renderer.
 *
 * Per Wave 11 §S11.12 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Two-step pipeline:
 *   1. `generateScript(deckId)` — AI turns the deck + notes into a two-voice
 *      script (Host ↔ Guest, 6–8 segments, each tied to a slide reference).
 *   2. `startRender(draftId)` + `getRenderStatus(renderId)` — TTS renders
 *      the script to MP3 with progress polling.
 *
 * Today this is a deterministic bootstrap that the podcast-svc client will
 * replace in a later wave. Renderings complete after exactly 3 polls
 * (pending → generating → rendering → complete) so the UI is verifiable
 * without the real TTS service.
 */

import { createDocumentLoader } from './deck-service.js';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Voice = 'host' | 'guest';

export interface ScriptSegment {
  id: string;
  voice: Voice;
  text: string;
  slide_id?: string;
  order: number;
}

export interface PodcastDraft {
  id: string;
  deck_id: string;
  title: string;
  segments: ScriptSegment[];
  created_at_ms: number;
  updated_at_ms: number;
}

export interface PodcastRender {
  id: string;
  draft_id: string;
  status: 'pending' | 'generating' | 'rendering' | 'complete' | 'failed';
  /** 0..100 */
  progress: number;
  audio_url?: string;
  duration_sec?: number;
  started_at_ms: number;
  completed_at_ms?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// In-memory store (process-local, deterministic for tests)
// ---------------------------------------------------------------------------

interface RenderEntry {
  render: PodcastRender;
  pollsRemaining: number;
}

const draftStore: Map<string, PodcastDraft> = new Map();
const renderStore: Map<string, RenderEntry> = new Map();

function nowMs(): number {
  return Date.now();
}

function genId(prefix: string): string {
  // Deterministic-friendly id: prefix + monotonic counter + time fallback.
  const counter = (Number.parseInt(String(Math.random() * 1e9), 10) || nowMs()) % 1e6;
  return `${prefix}-${counter.toString(36)}-${nowMs().toString(36)}`;
}

function cloneDraft(draft: PodcastDraft): PodcastDraft {
  return {
    ...draft,
    segments: draft.segments.map((s) => ({ ...s })),
  };
}

// ---------------------------------------------------------------------------
// Slide enumeration (best-effort, falls back to "slide-N" guesses)
// ---------------------------------------------------------------------------

interface SlideRef {
  id: string;
  label: string;
}

function loadSlideRefs(deckId: string): SlideRef[] {
  try {
    const loader = createDocumentLoader();
    const doc: { slides?: Array<{ id?: string; title?: string }> } = loader.example() as unknown as {
      slides?: Array<{ id?: string; title?: string }>;
    };
    void deckId; // bootstrap ignores deckId and returns the bundled example
    const slides = doc.slides ?? [];
    const refs: SlideRef[] = slides.map((s, idx) => ({
      id: s.id ?? `slide-${idx + 1}`,
      label: s.title ?? `Slide ${idx + 1}`,
    }));
    if (refs.length > 0) return refs;
  } catch {
    /* fall through */
  }
  return Array.from({ length: 8 }, (_, i) => ({
    id: `slide-${i + 1}`,
    label: `Slide ${i + 1}`,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the persisted draft for a deck, or `null` if none exists yet.
 */
export async function getDraft(deckId: string): Promise<PodcastDraft | null> {
  const existing = draftStore.get(deckId);
  return existing ? cloneDraft(existing) : null;
}

/**
 * Persist a draft. Subsequent `getDraft` calls return the updated copy.
 */
export async function saveDraft(draft: PodcastDraft): Promise<PodcastDraft> {
  const next: PodcastDraft = { ...cloneDraft(draft), updated_at_ms: nowMs() };
  draftStore.set(next.deck_id, next);
  return cloneDraft(next);
}

/**
 * Ask the AI to generate a two-voice script for the given deck.
 *
 * Deterministic bootstrap: returns a fresh draft with 6–8 segments
 * alternating Host ↔ Guest, each pointing at a slide from the deck.
 * The real podcast-svc client will replace this with an LLM call.
 */
export async function generateScript(deckId: string): Promise<PodcastDraft> {
  const now = nowMs();
  const refs = loadSlideRefs(deckId);
  const count = Math.min(8, Math.max(6, refs.length));
  const segments: ScriptSegment[] = Array.from({ length: count }, (_, idx) => {
    const voice: Voice = idx % 2 === 0 ? 'host' : 'guest';
    const ref = refs[idx % refs.length];
    const text = buildScriptLine(voice, idx, ref?.label ?? `Slide ${idx + 1}`);
    const seg: ScriptSegment = {
      id: genId('seg'),
      voice,
      text,
      order: idx,
    };
    if (ref) seg.slide_id = ref.id;
    return seg;
  });
  const draft: PodcastDraft = {
    id: genId('draft'),
    deck_id: deckId,
    title: 'Deck walkthrough',
    segments,
    created_at_ms: now,
    updated_at_ms: now,
  };
  draftStore.set(deckId, draft);
  return cloneDraft(draft);
}

function buildScriptLine(voice: Voice, idx: number, slideLabel: string): string {
  if (voice === 'host') {
    return [
      'Welcome back — let us kick things off with ' + slideLabel + '.',
      'Moving on to ' + slideLabel + ', here is the headline.',
      'Now ' + slideLabel + ' — three things stand out here.',
      'Let us zoom into ' + slideLabel + ' before we wrap.',
    ][idx % 4]!;
  }
  return [
    'Great context — and ' + slideLabel + ' makes it really concrete.',
    'That is the bit I would emphasize from ' + slideLabel + '.',
    'Right, and ' + slideLabel + ' confirms the wedge we keep coming back to.',
    'Good — ' + slideLabel + ' is where the call to action lives.',
  ][idx % 4]!;
}

/**
 * Kick off an MP3 render for a draft. Returns the freshly-queued render
 * in `pending` state with `progress: 0`.
 *
 * The mock pipeline advances through 3 polls:
 *   poll #1 → status `generating`, progress 25
 *   poll #2 → status `rendering`,  progress 70
 *   poll #3 → status `complete`,   progress 100, audio_url set
 */
export async function startRender(draftId: string): Promise<PodcastRender> {
  const started = nowMs();
  const render: PodcastRender = {
    id: genId('render'),
    draft_id: draftId,
    status: 'pending',
    progress: 0,
    started_at_ms: started,
  };
  renderStore.set(render.id, { render: { ...render }, pollsRemaining: 3 });
  return { ...render };
}

/**
 * Poll the current status of a render. Each call decrements the
 * remaining polls and advances the deterministic pipeline. Throws if
 * the render id is unknown so callers can surface failures.
 */
export async function getRenderStatus(renderId: string): Promise<PodcastRender> {
  const entry = renderStore.get(renderId);
  if (!entry) {
    throw new Error(`Unknown render id: ${renderId}`);
  }
  const { render, pollsRemaining } = entry;
  const nextPolls = pollsRemaining - 1;
  const updated: PodcastRender = advanceRender(render);
  renderStore.set(renderId, { render: updated, pollsRemaining: Math.max(0, nextPolls) });
  return { ...updated };
}

function advanceRender(prev: PodcastRender): PodcastRender {
  const finished = nowMs();
  switch (prev.status) {
    case 'pending':
      return { ...prev, status: 'generating', progress: 25 };
    case 'generating':
      return { ...prev, status: 'rendering', progress: 70 };
    case 'rendering':
      return {
        ...prev,
        status: 'complete',
        progress: 100,
        audio_url: `https://podcasts.example.com/renders/${prev.draft_id}.mp3`,
        duration_sec: 184,
        completed_at_ms: finished,
      };
    case 'complete':
    case 'failed':
      return prev;
  }
}

/** Test helper — wipe in-memory state between cases. */
export function __resetPodcastExportForTests(): void {
  draftStore.clear();
  renderStore.clear();
}