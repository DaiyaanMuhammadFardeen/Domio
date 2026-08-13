'use client';

/**
 * NotesGenerator — per-slide "Generate notes" UI.
 *
 * Per Wave 6 §S6.6 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Renders only when a slide is selected. Exposes three style presets
 * (bullets, paragraph, story) and an optional feedback input for
 * regeneration. Calls `ai-service.generateNotes(slideId, { style,
 * feedback, previousNotes })` and surfaces the result, then writes it
 * into the slide's `notes` field via `onInsertNotes(notes)`.
 *
 * The component is fully controlled by props so it can be dropped into
 * the slide inspector or a modal without owning any document state.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { RefreshCcw, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { generateNotes, type NotesStyle, type NotesResponse } from '../../lib/ai-service';

const STYLE_OPTIONS: ReadonlyArray<{ value: NotesStyle; label: string }> = [
  { value: 'bullets', label: 'Bullets' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'story', label: 'Story' },
];

export type GenerateNotesFn = (
  slideId: string,
  req: { style: NotesStyle; feedback?: string; previousNotes?: string },
) => Promise<NotesResponse>;

export interface NotesGeneratorProps {
  readonly slideId: string;
  /** Current notes on the slide (used for regeneration continuity). */
  readonly currentNotes?: string;
  /** Called when the user accepts the generated notes. */
  readonly onInsertNotes?: (notes: string) => void;
  /** Override the generator — useful for tests. */
  readonly generateNotesFn?: GenerateNotesFn;
  readonly disabled?: boolean;
}

const defaultGenerateNotes: GenerateNotesFn = async (slideId, req) =>
  generateNotes({
    slideId,
    style: req.style,
    ...(req.feedback !== undefined ? { feedback: req.feedback } : {}),
    ...(req.previousNotes !== undefined ? { previousNotes: req.previousNotes } : {}),
  });

export function NotesGenerator({
  slideId,
  currentNotes = '',
  onInsertNotes,
  generateNotesFn = defaultGenerateNotes,
  disabled = false,
}: NotesGeneratorProps): ReactElement {
  const [style, setStyle] = useState<NotesStyle>('bullets');
  const [feedback, setFeedback] = useState('');
  const [result, setResult] = useState<NotesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  // Reset state when the slide changes.
  useEffect(() => {
    setResult(null);
    setError(null);
    setFeedback('');
    setRegenCount(0);
  }, [slideId]);

  const handleGenerate = useCallback(
    async (overrideFeedback?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await generateNotesFn(slideId, {
          style,
          feedback: overrideFeedback ?? feedback,
          previousNotes: result?.notes ?? currentNotes,
        });
        setResult(res);
        setRegenCount((n) => n + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [slideId, style, feedback, result, currentNotes, generateNotesFn],
  );

  const handleAccept = useCallback(() => {
    if (!result) return;
    onInsertNotes?.(result.notes);
  }, [result, onInsertNotes]);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3"
      data-testid="notes-generator"
      aria-label="Generate speaker notes"
    >
      <header className="flex items-center gap-2">
        <Sparkles size={14} className="text-blue-400" />
        <h3 className="text-xs font-semibold text-slate-200">Speaker notes</h3>
      </header>

      <div
        className="flex gap-1 rounded-md bg-slate-900/60 p-0.5"
        role="radiogroup"
        aria-label="Notes style"
      >
        {STYLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={style === opt.value}
            disabled={disabled}
            onClick={() => setStyle(opt.value)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-all',
              style === opt.value
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300',
              disabled && 'opacity-50',
            )}
            data-testid={`notes-generator-style-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => handleGenerate()}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5',
          'text-xs font-medium text-white transition-colors',
          loading ? 'bg-slate-700 opacity-70' : 'bg-blue-600 hover:bg-blue-500',
          disabled && 'opacity-50',
        )}
        data-testid="notes-generator-generate"
      >
        <Sparkles size={12} />
        {loading ? 'Generating…' : regenCount === 0 ? 'Generate' : 'Regenerate'}
      </button>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        <span>Feedback (optional)</span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          placeholder="e.g. Make it more concise; emphasize the second metric."
          disabled={disabled || loading}
          className={cn(
            'resize-none rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1',
            'text-[12px] text-slate-100 placeholder-slate-500 outline-none transition-colors',
            'focus:border-blue-500/50 disabled:opacity-50',
          )}
          data-testid="notes-generator-feedback"
        />
      </label>

      {result ? (
        <div className="flex flex-col gap-2" data-testid="notes-generator-result">
          <div
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-[12px] text-slate-200"
            data-testid="notes-generator-preview"
          >
            {result.notes}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAccept}
              disabled={disabled}
              className={cn(
                'flex-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors',
                'hover:bg-emerald-500 disabled:opacity-50',
              )}
              data-testid="notes-generator-insert"
            >
              Insert into slide
            </button>
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={disabled || loading}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-slate-700/60 px-2.5 py-1.5',
                'text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/60',
                'disabled:opacity-50',
              )}
              data-testid="notes-generator-regenerate"
            >
              <RefreshCcw size={12} />
              Regenerate
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
          data-testid="notes-generator-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
