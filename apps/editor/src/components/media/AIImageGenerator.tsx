/**
 * AIImageGenerator — prompt + style picker for AI image generation.
 *
 * Per Wave 6 §S6.5 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Flow:
 *  1. User types a prompt + optional negative prompt + picks a style.
 *  2. Click "Generate" → POST /v1/ai/image → renders 4 candidates.
 *  3. Click a candidate → calls onInsert('image', { src, ... }).
 *  4. Hover any candidate → shows a provenance chip (model + seed).
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { useT } from '../../lib/locale';
import {
  AI_IMAGE_STYLE_OPTIONS,
  generateImages,
  removeImageBackground,
  type AiImageCandidate,
  type AiImageStyle,
  type AiImageGenerationResult,
} from '../../lib/image-service';

export interface AIImageGeneratorProps {
  /** Insert a generated image into the active slide. */
  onInsert: (kind: 'image', props: Record<string, unknown>) => void;
  /** Optional base URL for the AI service. */
  apiBaseUrl?: string;
}

const STYLE_TESTID_PREFIX = 'p6-ai-image-style';
const CANDIDATE_TESTID_PREFIX = 'p6-ai-image-candidate';

export function AIImageGenerator({ onInsert, apiBaseUrl }: AIImageGeneratorProps): ReactElement {
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState<AiImageStyle>('photorealistic');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiImageGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canGenerate = prompt.trim().length > 0 && !busy;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const out = await generateImages(
        {
          prompt: prompt.trim(),
          ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
          style,
          count: 4,
        },
        apiBaseUrl,
      );
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [canGenerate, prompt, negativePrompt, style, apiBaseUrl]);

  const handlePick = useCallback(
    (candidate: AiImageCandidate) => {
      onInsert('image', {
        src: candidate.url,
        aiImageId: candidate.id,
        aiProvenance: candidate.provenance,
        aiStyle: candidate.style,
      });
    },
    [onInsert],
  );

  const handleRemoveBackground = useCallback(
    async (candidate: AiImageCandidate) => {
      setRemovingId(candidate.id);
      try {
        const out = await removeImageBackground(candidate.id, candidate.url, apiBaseUrl);
        onInsert('image', {
          src: out.url,
          aiImageId: out.id,
          aiProvenance: out.provenance,
          aiStyle: candidate.style,
          backgroundRemoved: true,
          sourceAiImageId: candidate.id,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRemovingId(null);
      }
    },
    [onInsert, apiBaseUrl],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="p6-ai-image-generator">
      <div className="flex flex-col gap-1">
        <label htmlFor="p6-ai-image-prompt" className="text-[11px] font-medium text-slate-400">
          {t('p6.copilot.aiImage.prompt')}
        </label>
        <textarea
          id="p6-ai-image-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('p6.copilot.aiImage.promptPlaceholder')}
          rows={3}
          className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50"
          data-testid="p6-ai-image-prompt"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="p6-ai-image-negative-prompt"
          className="text-[11px] font-medium text-slate-400"
        >
          {t('p6.copilot.aiImage.negativePrompt')}
        </label>
        <input
          id="p6-ai-image-negative-prompt"
          type="text"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder={t('p6.copilot.aiImage.negativePromptPlaceholder')}
          className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/50"
          data-testid="p6-ai-image-negative-prompt"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-slate-400">
          {t('p6.copilot.aiImage.style')}
        </span>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label={t('p6.copilot.aiImage.style')}
        >
          {AI_IMAGE_STYLE_OPTIONS.map((opt) => {
            const selected = style === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setStyle(opt.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  selected
                    ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                    : 'border-slate-700/60 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
                data-testid={`${STYLE_TESTID_PREFIX}-${opt.id}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
          data-testid="p6-ai-image-generate"
        >
          {busy ? t('p6.copilot.aiImage.generating') : t('p6.copilot.aiImage.generate')}
        </button>
        {result && (
          <span className="text-[11px] text-slate-500" data-testid="p6-ai-image-count">
            {t('p6.copilot.aiImage.candidateCount', { count: result.candidates.length })}
          </span>
        )}
      </div>

      {error && (
        <div
          className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="p6-ai-image-error"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-2 gap-2" data-testid="p6-ai-image-results">
          {result.candidates.map((candidate, i) => {
            const isHovered = hoveredId === candidate.id;
            const isRemoving = removingId === candidate.id;
            return (
              <div
                key={candidate.id}
                className="group relative overflow-hidden rounded-md border border-slate-700/60 bg-slate-800/40"
                data-testid={`${CANDIDATE_TESTID_PREFIX}-${i}`}
                onMouseEnter={() => setHoveredId(candidate.id)}
                onMouseLeave={() => setHoveredId((id) => (id === candidate.id ? null : id))}
              >
                <button
                  type="button"
                  onClick={() => handlePick(candidate)}
                  className="block w-full"
                  aria-label={t('p6.copilot.aiImage.insertCandidate', { index: i + 1 })}
                >
                  <img
                    src={candidate.thumbnailUrl ?? candidate.url}
                    alt={t('p6.copilot.aiImage.candidateAlt', { index: i + 1 })}
                    className="aspect-[3/2] w-full object-cover"
                    data-testid={`${CANDIDATE_TESTID_PREFIX}-${i}-img`}
                  />
                </button>
                {isHovered && (
                  <div
                    className="absolute left-1.5 top-1.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-slate-200"
                    data-testid={`${CANDIDATE_TESTID_PREFIX}-${i}-provenance`}
                  >
                    {candidate.provenance.model} · seed {candidate.provenance.seed}
                  </div>
                )}
                <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                  <span className="text-[10px] text-slate-500">{candidate.style}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveBackground(candidate)}
                    disabled={isRemoving}
                    className="rounded border border-slate-700/60 bg-slate-900/40 px-1.5 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:opacity-50"
                    data-testid={`${CANDIDATE_TESTID_PREFIX}-${i}-remove-bg`}
                  >
                    {isRemoving
                      ? t('p6.copilot.aiImage.removingBg')
                      : t('p6.copilot.aiImage.removeBg')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
