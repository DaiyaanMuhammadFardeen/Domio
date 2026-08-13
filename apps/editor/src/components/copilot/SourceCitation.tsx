'use client';

/**
 * SourceCitation — chip used inside the OutlineApproval UI to surface a
 * single citation source.
 *
 * Per Wave 6 §S6.2 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Clicking the chip either:
 *   - calls `onActivate?.(citation)` so the parent can do something
 *     custom (e.g. open a modal), OR
 *   - when `onActivate` is not provided, opens a link to
 *     `/citation/[id]` via `POST /v1/ai/cite/{id}/open` (the call is
 *     fire-and-forget — the result is the citation paragraph that
 *     would be displayed in the citation page).
 *
 * Renders only the visible label; the chip keeps Tailwind classes only
 * (no raw hex).
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { openCitation } from '../../lib/ai-service';

export interface SourceCitationProps {
  readonly citationId: string;
  readonly label?: string;
  readonly onActivate?: (citationId: string) => void;
  readonly className?: string;
}

export function SourceCitation({
  citationId,
  label,
  onActivate,
  className,
}: SourceCitationProps): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (onActivate) {
      onActivate(citationId);
      return;
    }
    setPending(true);
    setError(null);
    openCitation(citationId)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setPending(false);
      });
  }, [citationId, onActivate]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-indigo-500/30',
        'bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300',
        'transition-colors hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-indigo-200',
        className,
      )}
      data-testid={`source-citation-${citationId}`}
      aria-label={`Citation source ${label ?? citationId}`}
    >
      <Link2 size={10} />
      <span className="truncate">{label ?? citationId}</span>
      {pending ? <span className="ml-0.5 text-[8px] text-indigo-200/70">…</span> : null}
      {error ? (
        <span
          className="ml-1 text-[8px] text-red-300"
          role="alert"
          data-testid={`source-citation-error-${citationId}`}
        >
          !
        </span>
      ) : null}
    </button>
  );
}
