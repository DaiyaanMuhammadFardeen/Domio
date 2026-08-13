'use client';

/**
 * AudienceVersionsPanel — branched deck versions per persona.
 *
 * Per Wave 6 §S6.8 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * The user picks one of three personas (5-min lightning, technical
 * deep-dive, executive overview). The panel calls POST /v1/ai/versions
 * and renders the returned branched deck. The new deck id is surfaced
 * via `onVersion` so the parent can switch to it.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import {
  generateAudienceVersion,
  personaLabel,
  type AudiencePersona,
  type AudienceVersion,
  type DeckContext,
} from './lib/qa-service';

export interface AudienceVersionsPanelProps {
  deck: DeckContext;
  /** Fires when a branched deck version has been generated. */
  onVersion?: (version: AudienceVersion) => void;
  /** Optional override for the testid. */
  dataTestId?: string;
}

interface PersonaOption {
  value: AudiencePersona;
  label: string;
  hint: string;
}

const PERSONAS: readonly PersonaOption[] = [
  {
    value: 'five_min',
    label: personaLabel('five_min'),
    hint: 'Trimmed to a 5-minute lightning walk-through.',
  },
  {
    value: 'technical',
    label: personaLabel('technical'),
    hint: 'Expanded with architecture, benchmarks, and trade-offs.',
  },
  {
    value: 'executive',
    label: personaLabel('executive'),
    hint: 'Headline-only view of every slide for the C-suite.',
  },
];

export function AudienceVersionsPanel({
  deck,
  onVersion,
  dataTestId = 'audience-versions',
}: AudienceVersionsPanelProps): ReactElement {
  const [persona, setPersona] = useState<AudiencePersona>('executive');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState<AudienceVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback((next: AudiencePersona) => {
    setPersona(next);
    setVersion(null);
    setError(null);
  }, []);

  const onGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateAudienceVersion({ deck, persona });
      setVersion(result);
      onVersion?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate version');
    } finally {
      setLoading(false);
    }
  }, [deck, persona, onVersion]);

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"
      data-testid={dataTestId}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-100">Audience versions</h3>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          data-testid={`${dataTestId}-generate`}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {version ? 'Regenerate' : 'Branch deck'}
        </button>
      </header>

      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Audience persona"
        data-testid={`${dataTestId}-personas`}
      >
        {PERSONAS.map((p) => {
          const selected = persona === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(p.value)}
              className={`flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                selected
                  ? 'border-purple-500/60 bg-purple-500/10 text-slate-100'
                  : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:border-slate-500'
              }`}
              data-testid={`${dataTestId}-persona-${p.value}`}
            >
              <span className="text-xs font-medium">{p.label}</span>
              <span className="text-[10px] text-slate-500">{p.hint}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          className="rounded-md border border-rose-700/60 bg-rose-900/20 p-2 text-xs text-rose-200"
          data-testid={`${dataTestId}-error`}
          role="alert"
        >
          {error}
        </p>
      )}

      {version && (
        <div className="flex flex-col gap-2" data-testid={`${dataTestId}-result`}>
          {version.offline && (
            <p
              className="rounded-md border border-amber-700/60 bg-amber-900/15 p-2 text-[11px] text-amber-200"
              data-testid={`${dataTestId}-offline`}
            >
              Offline mode — branched locally; sync when online.
            </p>
          )}

          <div
            className="flex items-center justify-between rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2"
            data-testid={`${dataTestId}-meta`}
          >
            <span className="text-xs font-medium text-slate-200">{version.label}</span>
            <span
              className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300"
              data-testid={`${dataTestId}-id`}
            >
              {version.id}
            </span>
          </div>

          <ul className="flex flex-col gap-1" data-testid={`${dataTestId}-slides`}>
            {version.slides.map((s) => (
              <li
                key={s.slide_id}
                className="rounded border border-slate-700/60 bg-slate-800/30 px-2 py-1.5"
                data-testid={`${dataTestId}-slide-${s.slide_id}`}
              >
                <p className="text-xs font-medium text-slate-100">{s.title}</p>
                {s.body && <p className="text-[11px] text-slate-400">{s.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
