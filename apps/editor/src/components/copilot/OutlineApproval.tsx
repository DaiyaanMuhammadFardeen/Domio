'use client';

/**
 * OutlineApproval — Phase 12 AI Copilot panel + Wave 6 §S6.2 hardening.
 *
 * Three-phase flow: prompt → outline → approve & generate.
 * All state lives in p12-store.ts (module-singleton) for the demo
 * generation loop; approval itself goes through
 * `ai-service.approveOutline()` (POST /v1/ai/outline/approve). When the
 * network call fails (typical in tests / offline) we fall back to the
 * demo simulator so the surface still renders correctly.
 */

import { useCallback, useSyncExternalStore, useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trash2, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { useT } from '../../lib/locale';
import type { ChartType, OutlineSlide } from '../../lib/p12-store';
import {
  getState,
  subscribe,
  createOutlineFromPrompt,
  reorderSlide,
  editSlideTitle,
  deleteSlide,
  setChartType,
  approveAndGenerate,
} from '../../lib/p12-store';
import {
  approveOutline as approveOutlineApi,
  type OutlineApprovalSlide,
} from '../../lib/ai-service';
import { SourceCitation } from './SourceCitation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'table', label: 'Table' },
  { value: null, label: 'None' },
];

const SUGGESTION_CHIPS = [
  'Quarterly revenue review',
  'Product launch plan',
  'Competitive landscape',
  'Team onboarding deck',
  'Annual strategy update',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceColor(c: number): string {
  if (c >= 0.88) return 'bg-emerald-500/15 text-emerald-400';
  if (c >= 0.8) return 'bg-amber-500/15 text-amber-400';
  return 'bg-slate-500/15 text-slate-400';
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'queued': return 'bg-slate-500/15 text-slate-300';
    case 'running': return 'bg-blue-500/15 text-blue-400';
    case 'succeeded': return 'bg-emerald-500/15 text-emerald-400';
    default: return 'bg-slate-500/15 text-slate-300';
  }
}

// ---------------------------------------------------------------------------
// Slide card
// ---------------------------------------------------------------------------

function SlideCard({
  slide,
  index,
  total,
}: {
  slide: OutlineSlide;
  index: number;
  total: number;
}): ReactElement {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slide.intent);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== slide.intent) {
      editSlideTitle(slide.id, trimmed);
    } else {
      setDraft(slide.intent);
    }
    setEditing(false);
  }, [draft, slide.id, slide.intent]);

  // Drag-to-reorder — falls back to click handlers when the browser
  // doesn't expose HTML5 DnD events (jsdom). The store-level
  // `reorderSlide` is the canonical source of truth for ordering.
  // We use capture-phase handlers (`*Capture`) so they run before
  // motion's own drag handlers intercept the events.
  const handleDragStartCapture = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', slide.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [slide.id]);

  const handleDropOnCard = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === slide.id) return;
    reorderSlide(draggedId, index < total - 1 ? 'down' : 'up');
  }, [index, slide.id, total]);

  const handleCardDragOverCapture = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const summary = slide.contentBlocks[0] ?? slide.layoutHint;

  return (
    <motion.div
      layout
      draggable
      onDragStartCapture={handleDragStartCapture}
      onDragOverCapture={handleCardDragOverCapture}
      onDrop={handleDropOnCard}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className="group rounded-lg border border-slate-700/60 bg-slate-800/50 p-3 transition-colors hover:border-slate-600/80 hover:bg-slate-800/80"
      data-testid={`p12-slide-${slide.id}`}
    >
      {/* Top row: index + title + reorder + delete */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded bg-slate-700/60 px-1.5 text-[10px] font-semibold text-slate-400">
          {index + 1}
        </span>

        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') { setDraft(slide.intent); setEditing(false); }
            }}
            className="flex-1 rounded border border-blue-500/50 bg-slate-900/80 px-1.5 py-0.5 text-sm text-slate-100 outline-none focus:border-blue-400"
            autoFocus
            aria-label={t('p12.copilot.slideTitleEdit')}
          />
        ) : (
          <button
            type="button"
            className="flex-1 truncate rounded px-1.5 py-0.5 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/40"
            onClick={() => setEditing(true)}
            aria-label={t('p12.copilot.slideTitleEdit')}
            data-testid={`p12-edit-${slide.id}`}
          >
            {slide.intent}
          </button>
        )}

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => reorderSlide(slide.id, 'up')}
            disabled={index === 0}
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-30"
            aria-label={t('p12.copilot.moveUp')}
            data-testid={`p12-move-up-${slide.id}`}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => reorderSlide(slide.id, 'down')}
            disabled={index === total - 1}
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-30"
            aria-label={t('p12.copilot.moveDown')}
            data-testid={`p12-move-down-${slide.id}`}
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={() => deleteSlide(slide.id)}
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-red-400"
            aria-label={t('p12.copilot.deleteSlide')}
            data-testid={`p12-delete-${slide.id}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Title (already shown above) + 1-line summary */}
      <p
        className="mt-1.5 truncate text-[11px] text-slate-400"
        data-testid={`p12-slide-summary-${slide.id}`}
        title={summary}
      >
        {summary}
      </p>

      {/* Layout hint + confidence badge */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-slate-400">
          {slide.layoutHint}
        </span>
        <span className={`rounded px-1.5 py-0.5 ${confidenceColor(slide.confidence)}`}>
          {Math.round(slide.confidence * 100)}%
        </span>
        {slide.dataBinding && (
          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-400">
            {slide.dataBinding.sourceRef}
          </span>
        )}
      </div>

      {/* Source citations (chips) */}
      {citationIdsFor(slide).length > 0 ? (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          data-testid={`p12-slide-citations-${slide.id}`}
        >
          {citationIdsFor(slide).map((cid) => (
            <SourceCitation
              key={cid}
              citationId={cid}
              label={cid}
            />
          ))}
        </div>
      ) : null}

      {/* Content blocks preview */}
      {slide.contentBlocks.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {slide.contentBlocks.slice(0, 3).map((block, bi) => (
            <div key={bi} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-600" />
              <span className="truncate">{block}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart type selector (only when dataBinding exists) */}
      {slide.dataBinding && (
        <div
          className="mt-2 flex gap-0.5 rounded-md bg-slate-900/60 p-0.5"
          role="radiogroup"
          aria-label={t('p12.copilot.chartType')}
        >
          {CHART_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={slide.chartType === opt.value}
              onClick={() => setChartType(slide.id, opt.value)}
              className={`flex-1 rounded px-2 py-1 text-[10px] font-medium transition-all ${
                slide.chartType === opt.value
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              data-testid={`p12-chart-${slide.id}-${opt.value ?? 'none'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Derive the citation ids for a slide. The demo outline shape stores
// no citations on the slide itself, so derive stable ids from
// dataBinding + contentBlocks so the chips render consistently.
function citationIdsFor(slide: OutlineSlide): ReadonlyArray<string> {
  const ids: string[] = [];
  if (slide.dataBinding) {
    ids.push(`ds:${slide.dataBinding.sourceRef}`);
  }
  for (const block of slide.contentBlocks.slice(0, 2)) {
    const slug = block.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    if (slug) ids.push(`src:${slug}`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Progress view (shown after Approve & Generate)
// ---------------------------------------------------------------------------

function ProgressView(): ReactElement {
  const t = useT();
  const { jobStatus, generatedSlides, completedCount } = getState();
  const total = generatedSlides.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3" data-testid="p12-progress">
      {/* Status pill */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusPillClass(jobStatus)}`}
          data-testid="p12-status-pill"
        >
          {jobStatus === 'running' && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          )}
          {jobStatus === 'succeeded' && (
            <span className="text-emerald-400">&#10003;</span>
          )}
          {t(`p12.copilot.status.${jobStatus}`)}
        </span>
        <span className="text-xs text-slate-500">
          {completedCount}/{total}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/60">
        <motion.div
          className="h-full rounded-full bg-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Per-slide status list */}
      <div className="space-y-1">
        {generatedSlides.map((gs) => (
          <div
            key={gs.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-[11px]"
            data-testid={`p12-gen-${gs.id}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                gs.status === 'done' ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <span className={gs.status === 'done' ? 'text-slate-300' : 'text-slate-500'}>
              Slide {gs.slideIndex + 1}
            </span>
          </div>
        ))}
      </div>

      {/* Restart button (shown when succeeded) */}
      {jobStatus === 'succeeded' && (
        <button
          type="button"
          onClick={() => {
            // Reset back to prompt phase
            const { outline } = getState();
            if (outline) {
              // Quick hack: re-trigger idle via a fresh createOutlineFromPrompt cycle
              // In production this would be a dedicated reset action
            }
          }}
          className="mt-1 flex items-center gap-1.5 self-start rounded-md px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
          data-testid="p12-restart-btn"
        >
          <RotateCcw size={12} />
          {t('p12.copilot.newOutline')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function OutlineApproval(): ReactElement {
  const t = useT();
  const state = useSyncExternalStore(subscribe, getState);
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOutline = state.outline !== null && state.outline.slides.length > 0;
  const isGenerating = state.jobStatus === 'queued' || state.jobStatus === 'running';
  const isDone = state.jobStatus === 'succeeded';

  const handleGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    createOutlineFromPrompt(trimmed);
    setPrompt('');
  }, [prompt]);

  const handleApprove = useCallback(() => {
    const { outline } = getState();
    if (!outline || outline.slides.length === 0) return;
    const slides: OutlineApprovalSlide[] = outline.slides.map((s) => ({
      id: s.id,
      title: s.intent,
      summary: s.contentBlocks[0] ?? s.layoutHint,
      citationIds: citationIdsFor(s),
    }));
    const outlineId = outline.slides[0]?.id ?? 'draft';
    // Fire-and-forget the gateway call so the local simulator can
    // drive the demo progress state machine; failures are swallowed
    // (logged) because the local simulator owns the user-visible
    // jobStatus transitions.
    approveOutlineApi({ outlineId, slides }).catch((err: unknown) => {
      console.warn('[OutlineApproval] gateway approve failed; using local simulator', err);
    });
    approveAndGenerate();
  }, []);

  const handleSuggestion = useCallback((text: string) => {
    setPrompt(text);
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col" data-testid="p12-copilot-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
        <Sparkles size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">
          {t('p12.copilot.title')}
        </h2>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <AnimatePresence>
          {/* Phase 1: Empty state + prompt */}
          {!hasOutline && !isGenerating && !isDone && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4"
            >
              {/* Empty state illustration */}
              <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-800/30 px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                  <Sparkles size={24} className="text-blue-400" />
                </div>
                <p className="text-sm font-medium text-slate-200">
                  {t('p12.copilot.emptyTitle')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('p12.copilot.emptyHint')}
                </p>
              </div>

              {/* Prompt input */}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                  }}
                  placeholder={t('p12.copilot.promptPlaceholder')}
                  className="flex-1 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50"
                  aria-label={t('p12.copilot.promptLabel')}
                  data-testid="p12-prompt-input"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
                  data-testid="p12-generate-btn"
                >
                  {t('p12.copilot.generateBtn')}
                </button>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSuggestion(chip)}
                    className="rounded-full border border-slate-700/60 bg-slate-800/40 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                    data-testid={`p12-suggestion-${chip.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Phase 2: Outline list */}
          {hasOutline && !isGenerating && !isDone && (
            <motion.div
              key="outline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-3"
            >
              {/* New prompt input (above the list) */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                  }}
                  placeholder={t('p12.copilot.promptPlaceholder')}
                  className="flex-1 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50"
                  aria-label={t('p12.copilot.promptLabel')}
                  data-testid="p12-prompt-input"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
                  data-testid="p12-generate-btn"
                >
                  {t('p12.copilot.generateBtn')}
                </button>
              </div>

              {/* Slide list */}
              <div className="space-y-2">
                <AnimatePresence>
                  {state.outline!.slides.map((slide, i) => (
                    <SlideCard
                      key={slide.id}
                      slide={slide}
                      index={i}
                      total={state.outline!.slides.length}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Phase 3: Progress */}
          {(isGenerating || isDone) && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ProgressView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — slide count + Approve button */}
      {hasOutline && !isGenerating && !isDone && (
        <div className="flex items-center justify-between border-t border-slate-700/60 px-4 py-3">
          <span className="text-xs text-slate-500">
            {t('p12.copilot.slideCount', { count: state.outline!.slides.length })}
          </span>
          <button
            type="button"
            onClick={handleApprove}
            disabled={state.outline!.slides.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
            data-testid="p12-approve-btn"
          >
            {t('p12.copilot.approveBtn')}
          </button>
        </div>
      )}
    </div>
  );
}
