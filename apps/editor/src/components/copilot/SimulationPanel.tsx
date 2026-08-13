'use client';

/**
 * SimulationPanel — Phase 12 AI Copilot surface.
 *
 * Per Wave 6 §S6.12 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Three persona presets (Executive / Analyst / Skeptic). Pick one,
 * click Run, POST /v1/ai/simulation → renders an engagement heatmap
 * (one bar per slide, scaled by `engagement`). The deck never has to
 * go live — this is purely simulated.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { FlaskConical, Loader2, AlertTriangle, Play } from 'lucide-react';
import { useT } from '../../lib/locale';
import { cn } from '../../lib/cn';
import {
  PERSONAS,
  runSimulation,
  engagementColor,
  intensityClass,
  type PersonaId,
  type SimulationResponse,
  type SlideEngagement,
} from './lib/simulation-service';

export interface SimulationPanelProps {
  readonly deckId?: string;
  readonly baseUrl?: string;
  readonly onComplete?: (result: SimulationResponse) => void;
}

export function SimulationPanel({
  deckId = 'demo',
  baseUrl,
  onComplete,
}: SimulationPanelProps): ReactElement {
  const t = useT();
  const [persona, setPersona] = useState<PersonaId>('exec');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await runSimulation({ deckId, persona }, baseUrl);
      setResult(res);
      onComplete?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'simulation failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [deckId, persona, baseUrl, onComplete]);

  const overallColor = result ? engagementColor(result.overallEngagement) : 'bg-slate-700';

  return (
    <div className="flex flex-col gap-3" data-testid="simulation-panel-root">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="text-violet-400" />
        <h2 className="text-sm font-semibold text-slate-100">Simulation Mode</h2>
      </div>

      {/* Persona picker */}
      <div
        role="radiogroup"
        aria-label="Simulation persona"
        className="flex flex-col gap-1.5"
        data-testid="simulation-persona-picker"
      >
        {PERSONAS.map((p) => {
          const selected = persona === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPersona(p.id)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-all',
                selected
                  ? 'border-violet-500/50 bg-violet-500/10'
                  : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600',
              )}
              data-testid={`simulation-persona-${p.id}`}
            >
              <span
                className={cn(
                  'text-xs font-medium',
                  selected ? 'text-violet-200' : 'text-slate-200',
                )}
              >
                {p.label}
              </span>
              <span className="text-[10px] text-slate-500">{p.description}</span>
            </button>
          );
        })}
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-violet-500 disabled:opacity-40"
        data-testid="simulation-run-btn"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        Run simulation
      </button>

      {/* Error */}
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="simulation-error"
        >
          <AlertTriangle size={12} />
          {error}
        </p>
      ) : null}

      {/* Heatmap */}
      {result ? (
        <div className="flex flex-col gap-1.5" data-testid="simulation-heatmap">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {PERSONAS.find((p) => p.id === result.persona)?.label} · {result.slides.length} slides
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold text-white',
                overallColor,
              )}
              data-testid="simulation-overall"
            >
              {result.overallEngagement}% engagement
            </span>
          </div>
          <ul className="space-y-1" data-testid="simulation-slide-list">
            {result.slides.map((s) => (
              <SlideRow key={s.slideId} slide={s} />
            ))}
          </ul>
        </div>
      ) : null}

      <span className="sr-only">{t('simulation.title')}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap row
// ---------------------------------------------------------------------------

function SlideRow({ slide }: { slide: SlideEngagement }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="rounded-md border border-slate-700/60 bg-slate-800/40 p-1.5"
      data-testid={`simulation-slide-${slide.slideId}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-[10px] font-semibold text-slate-500">
          {slide.slideIndex + 1}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900/60">
          <span
            className={cn(
              'block h-full transition-all',
              engagementColor(slide.engagement),
              intensityClass(slide.engagement),
            )}
            style={{ width: `${Math.max(0, Math.min(100, slide.engagement))}%` }}
            data-testid={`simulation-slide-engagement-${slide.slideId}`}
          />
        </div>
        <span
          className="w-9 shrink-0 text-right text-[10px] font-semibold text-slate-300"
          data-testid={`simulation-slide-score-${slide.slideId}`}
        >
          {slide.engagement}%
        </span>
        {slide.flags.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 transition-all hover:bg-amber-500/20"
            data-testid={`simulation-slide-flags-toggle-${slide.slideId}`}
            aria-expanded={open}
          >
            {slide.flags.length} flag{slide.flags.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
      {open && slide.flags.length > 0 ? (
        <ul
          className="mt-1 space-y-0.5 border-t border-slate-700/40 pt-1 text-[10px] text-amber-200"
          data-testid={`simulation-slide-flags-${slide.slideId}`}
        >
          {slide.flags.map((f, i) => (
            <li key={i} data-testid={`simulation-slide-flag-${slide.slideId}-${i}`}>
              • {f}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default SimulationPanel;
