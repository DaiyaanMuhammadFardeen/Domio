/**
 * Phase 12 — AI Copilot outline store.
 *
 * Mirrors p11-store.ts pattern: module singleton with subscribe API,
 * swappable for real AI-generated outline calls later.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChartType = 'bar' | 'line' | 'pie' | 'table' | null;

export interface DataBinding {
  sourceRef: string;
  rowRange: string;
}

export interface OutlineSlide {
  id: string;
  intent: string;
  layoutHint: string;
  contentBlocks: string[];
  chartType: ChartType;
  confidence: number;
  dataBinding: DataBinding | null;
}

export type JobStatus = 'idle' | 'queued' | 'running' | 'succeeded';

export interface GeneratedSlide {
  id: string;
  slideIndex: number;
  status: 'pending' | 'done';
}

export interface P12State {
  outline: { slides: OutlineSlide[] } | null;
  jobStatus: JobStatus;
  generatedSlides: GeneratedSlide[];
  completedCount: number;
}

// ---------------------------------------------------------------------------
// Demo outline synthesis (no backend — realistic 6-8 slide structure)
// ---------------------------------------------------------------------------

const SAMPLE_OUTLINES: Record<string, { slides: OutlineSlide[] }> = {
  _default: {
    slides: [
      {
        id: 's1',
        intent: 'Opening & Context',
        layoutHint: 'title-hero',
        contentBlocks: ['Welcome message', 'Meeting objectives'],
        chartType: null,
        confidence: 0.92,
        dataBinding: null,
      },
      {
        id: 's2',
        intent: 'Key Metrics Overview',
        layoutHint: 'data-focus',
        contentBlocks: ['Revenue trend', 'Growth rate', 'YoY comparison'],
        chartType: 'bar',
        confidence: 0.88,
        dataBinding: { sourceRef: 'metrics-dataset', rowRange: '1-12' },
      },
      {
        id: 's3',
        intent: 'Revenue Breakdown',
        layoutHint: 'chart-with-caption',
        contentBlocks: ['Revenue by segment', 'Margin analysis'],
        chartType: 'pie',
        confidence: 0.85,
        dataBinding: { sourceRef: 'revenue-segments', rowRange: '1-5' },
      },
      {
        id: 's4',
        intent: 'Regional Performance',
        layoutHint: 'two-column',
        contentBlocks: ['Regional comparison table', 'Top performing regions'],
        chartType: 'table',
        confidence: 0.82,
        dataBinding: { sourceRef: 'regional-data', rowRange: '1-8' },
      },
      {
        id: 's5',
        intent: 'Quarterly Trends',
        layoutHint: 'chart-with-caption',
        contentBlocks: ['Trend trajectory', 'Seasonal patterns'],
        chartType: 'line',
        confidence: 0.9,
        dataBinding: { sourceRef: 'quarterly-trends', rowRange: '1-16' },
      },
      {
        id: 's6',
        intent: 'Highlights & Achievements',
        layoutHint: 'bullets',
        contentBlocks: ['Key milestones', 'Team accomplishments', 'Awards'],
        chartType: null,
        confidence: 0.87,
        dataBinding: null,
      },
      {
        id: 's7',
        intent: 'Action Items & Next Steps',
        layoutHint: 'two-column',
        contentBlocks: ['Short-term actions', 'Long-term roadmap'],
        chartType: null,
        confidence: 0.84,
        dataBinding: null,
      },
      {
        id: 's8',
        intent: 'Closing & Q&A',
        layoutHint: 'summary',
        contentBlocks: ['Summary of key points', 'Questions & discussion'],
        chartType: null,
        confidence: 0.91,
        dataBinding: null,
      },
    ],
  },
};

function synthesizeOutline(prompt: string): OutlineSlide[] {
  // Deterministic-ish demo: seed from prompt length + char codes
  const seed = prompt.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const count = 6 + (seed % 3); // 6-8 slides
  const base = SAMPLE_OUTLINES._default!.slides;

  return Array.from({ length: count }, (_, i) => {
    const src = base[i % base.length]!;
    const id = `s${i + 1}-${seed.toString(36)}`;
    return {
      ...src,
      id,
      // Slightly vary confidence per-slide for realism
      confidence: Math.min(0.99, src.confidence + (((seed + i * 7) % 10) - 5) / 100),
    };
  });
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

let _state: P12State = {
  outline: null,
  jobStatus: 'idle',
  generatedSlides: [],
  completedCount: 0,
};
let _listeners: Array<() => void> = [];
let _timers: ReturnType<typeof setTimeout>[] = [];

function notify() {
  for (const fn of _listeners) fn();
}

function setState(patch: Partial<P12State>) {
  _state = { ..._state, ...patch };
  notify();
}

function clearTimers() {
  for (const t of _timers) clearTimeout(t);
  _timers = [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getState(): P12State {
  return _state;
}

/** Create a synthetic outline from a prompt string (demo — no backend). */
export function createOutlineFromPrompt(prompt: string): void {
  clearTimers();
  const slides = synthesizeOutline(prompt);
  setState({
    outline: { slides },
    jobStatus: 'idle',
    generatedSlides: [],
    completedCount: 0,
  });
}

export function reorderSlide(id: string, dir: 'up' | 'down'): void {
  if (!_state.outline) return;
  const { slides } = _state.outline;
  const idx = slides.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= slides.length) return;
  const next = [...slides];
  [next[idx], next[target]] = [next[target]!, next[idx]!];
  setState({ outline: { slides: next } });
}

export function editSlideTitle(id: string, title: string): void {
  if (!_state.outline) return;
  setState({
    outline: {
      slides: _state.outline.slides.map((s) => (s.id === id ? { ...s, intent: title } : s)),
    },
  });
}

export function deleteSlide(id: string): void {
  if (!_state.outline) return;
  const next = _state.outline.slides.filter((s) => s.id !== id);
  setState({ outline: next.length > 0 ? { slides: next } : null });
}

export function setChartType(id: string, type: ChartType): void {
  if (!_state.outline) return;
  setState({
    outline: {
      slides: _state.outline.slides.map((s) => (s.id === id ? { ...s, chartType: type } : s)),
    },
  });
}

/**
 * Approve the outline and simulate generation with per-slide progress.
 * Transitions jobStatus: queued → running → succeeded over timers.
 */
export function approveAndGenerate(): void {
  if (!_state.outline || _state.jobStatus !== 'idle') return;

  const slides = _state.outline.slides;
  const generated: GeneratedSlide[] = slides.map((s, i) => ({
    id: s.id,
    slideIndex: i,
    status: 'pending' as const,
  }));

  setState({ jobStatus: 'queued', generatedSlides: generated, completedCount: 0 });

  // Simulate queued → running after a short delay
  const t1 = setTimeout(() => {
    setState({ jobStatus: 'running' });

    // Simulate per-slide completion over staggered timers
    slides.forEach((_, i) => {
      const delay = 200 + i * 300;
      const t = setTimeout(() => {
        const newSlides = _state.generatedSlides.map((gs) =>
          gs.slideIndex === i ? { ...gs, status: 'done' as const } : gs,
        );
        const completedCount = newSlides.filter((gs) => gs.status === 'done').length;
        const allDone = completedCount === newSlides.length;
        setState({
          generatedSlides: newSlides,
          completedCount,
          jobStatus: allDone ? 'succeeded' : _state.jobStatus,
        });
      }, delay);
      _timers.push(t);
    });
  }, 400);
  _timers.push(t1);
}

export function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

/** Reset store for tests. */
export function resetStore(): void {
  clearTimers();
  _state = {
    outline: null,
    jobStatus: 'idle',
    generatedSlides: [],
    completedCount: 0,
  };
  _listeners = [];
}
