'use client';

/**
 * ConfidenceBadge — small chip that shows a 0-100 confidence score
 * plus a provenance link.
 *
 * Per Wave 6 §S6.12 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Used inline next to any AI-generated claim (slide title, stat callout,
 * chart label, …). On hover the badge reveals the provenance link and
 * an explanation. The component is presentational; the parent decides
 * which `score` and `provenance` to feed in.
 */

import { useState, type ReactElement } from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';
import { confidenceColor, confidenceLabel, type ConfidenceRecord } from './lib/simulation-service';

export interface ConfidenceBadgeProps {
  /** 0-100 score. */
  readonly score: number;
  /** Optional provenance link / id. */
  readonly provenance?: string | null;
  /** Full claim text shown on hover (used as the aria-label). */
  readonly claim?: string;
  /** Optional explicit label override. */
  readonly label?: string;
  /** Optional href for the provenance link. */
  readonly provenanceHref?: string;
}

export function ConfidenceBadge({
  score,
  provenance = null,
  claim,
  label,
  provenanceHref,
}: ConfidenceBadgeProps): ReactElement {
  const [open, setOpen] = useState(false);
  const display = label ?? confidenceLabel(score);
  const pct = Math.max(0, Math.min(100, Math.round(score)));

  const record: ConfidenceRecord = {
    claimId: claim ?? 'unknown',
    score: pct,
    provenance,
    label: display,
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      data-testid="confidence-badge-root"
    >
      <button
        type="button"
        aria-label={`Confidence ${record.score}% (${record.label})${claim ? ` for ${claim}` : ''}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
          confidenceColor(record.score),
        )}
        data-testid="confidence-badge-chip"
        data-score={record.score}
      >
        <ShieldCheck size={10} />
        <span data-testid="confidence-badge-score">{pct}%</span>
        <span className="hidden sm:inline" data-testid="confidence-badge-label">
          {display}
        </span>
      </button>

      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-slate-700/60 bg-slate-900/95 p-2 text-[11px] text-slate-300 shadow-lg"
          data-testid="confidence-badge-tooltip"
        >
          <span className="block font-medium text-slate-100">
            {record.label} ({record.score}%)
          </span>
          {claim ? <span className="mt-1 block text-slate-400">{claim}</span> : null}
          {provenance ? (
            provenanceHref ? (
              <a
                href={provenanceHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                data-testid="confidence-badge-provenance"
              >
                <ExternalLink size={10} /> {provenance}
              </a>
            ) : (
              <span
                className="mt-1 inline-flex items-center gap-1 text-slate-400"
                data-testid="confidence-badge-provenance"
              >
                {provenance}
              </span>
            )
          ) : (
            <span className="mt-1 block text-[10px] text-slate-500">No provenance recorded</span>
          )}
        </span>
      ) : null}
    </span>
  );
}

export default ConfidenceBadge;
