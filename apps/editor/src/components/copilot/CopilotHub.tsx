'use client';

/**
 * CopilotHub — right-rail shell for the AI Copilot command center.
 *
 * Per Wave 6 §S6.1 of docs/frontend-roadmap/06-wave-ai-copilot-ui.md.
 *
 * Composes:
 *   - PromptInput (text/voice/file)
 *   - JobProgress (live status of the most recent planner job)
 *   - History (last 20 prompts)
 *
 * Toggles open/closed via Cmd+J (or Ctrl+J). Renders as a fixed
 * right-rail panel that doesn't intercept the rest of the editor
 * surface.
 *
 * The hub routes user submissions to the appropriate AI endpoint:
 *   - text prompt → POST /v1/ai/jobs (Planner)
 *   - voice blob  → POST /v1/ai/voice-to-deck
 *   - file        → POST /v1/ai/ingest, then POST /v1/ai/jobs
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PromptInput, type PromptSubmission } from './PromptInput';
import { JobProgress } from './JobProgress';
import { History, type HistoryEntry } from './History';
import { createPlannerJob, ingestFile, type JobRecord } from '../../lib/ai-service';

export interface CopilotHubProps {
  /** Default open state. Defaults to false. */
  readonly defaultOpen?: boolean;
  /** Override the keyboard chord (defaults to Cmd/Ctrl+J). */
  readonly hotkey?: string;
  /** Override the planner creator — useful for tests. */
  readonly createPlanner?: (prompt: string, fileId?: string) => Promise<JobRecord>;
  /** Override the ingest creator — useful for tests. */
  readonly ingestFileFn?: (file: File) => Promise<{ fileId: string }>;
  /** Override the voice-to-deck creator — useful for tests. */
  readonly startVoiceToDeckFn?: (blob: Blob) => Promise<JobRecord>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunked conversion to avoid call stack overflow on large blobs.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function inferIngestKind(file: File): 'pdf' | 'doc' | 'transcript' {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.doc') || lower.endsWith('.docx') || file.type.includes('msword'))
    return 'doc';
  return 'transcript';
}

const DEFAULT_HOTKEY = 'j';

function isCmdJEvent(e: KeyboardEvent, hotkey: string): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return false;
  return e.key.toLowerCase() === hotkey.toLowerCase();
}

export function CopilotHub({
  defaultOpen = false,
  hotkey = DEFAULT_HOTKEY,
  createPlanner = async (prompt, fileId) =>
    createPlannerJob(fileId ? { prompt, fileId } : { prompt }),
  ingestFileFn,
  startVoiceToDeckFn,
}: CopilotHubProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshHistoryKey, setRefreshHistoryKey] = useState(0);

  const hubRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+J toggles the panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isCmdJEvent(e, hotkey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkey]);

  // Auto-focus the prompt textbox on open.
  useEffect(() => {
    if (!open) return;
    const el = hubRef.current?.querySelector<HTMLTextAreaElement>(
      '[data-testid="copilot-prompt-text"]',
    );
    el?.focus();
  }, [open]);

  const handlePromptSubmit = useCallback(
    async (submission: PromptSubmission) => {
      setSubmitError(null);
      setSubmitting(true);
      try {
        if (submission.intent === 'prompt' && submission.text) {
          const job = await createPlanner(submission.text);
          setCurrentJob(job);
          setRefreshHistoryKey((n) => n + 1);
        } else if (submission.intent === 'file' && submission.file) {
          const kind = inferIngestKind(submission.file);
          const ingestFn =
            ingestFileFn ??
            (async (file: File) => {
              const data = await blobToBase64(file);
              const res = await ingestFile({
                kind,
                filename: file.name,
                data,
              });
              return { fileId: res.fileId };
            });
          const { fileId } = await ingestFn(submission.file);
          const job = await createPlanner(submission.file.name, fileId);
          setCurrentJob(job);
          setRefreshHistoryKey((n) => n + 1);
        } else if (submission.intent === 'voice' && submission.voice) {
          if (startVoiceToDeckFn) {
            const job = await startVoiceToDeckFn(submission.voice);
            setCurrentJob(job);
            setRefreshHistoryKey((n) => n + 1);
          } else {
            // Default: upload voice as a blob via ingest then start planner.
            const data = await blobToBase64(submission.voice);
            const res = await ingestFile({
              kind: 'transcript',
              filename: 'voice.webm',
              data,
            });
            const job = await createPlanner('Voice transcript', res.fileId);
            setCurrentJob(job);
            setRefreshHistoryKey((n) => n + 1);
          }
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [createPlanner, ingestFileFn, startVoiceToDeckFn],
  );

  const handleReopen = useCallback(
    (entry: HistoryEntry) => {
      // Re-opening loads the prompt text into a fresh job (re-runs planner).
      setCurrentJob(null);
      void createPlanner(entry.prompt)
        .then((job) => {
          setCurrentJob(job);
          setRefreshHistoryKey((n) => n + 1);
        })
        .catch((err: unknown) => {
          setSubmitError(err instanceof Error ? err.message : String(err));
        });
    },
    [createPlanner],
  );

  const handleBranch = useCallback(
    (entry: HistoryEntry) => {
      // Branching starts a new job seeded with the prior prompt.
      const branchPrompt = `${entry.prompt} (branch)`;
      setCurrentJob(null);
      void createPlanner(branchPrompt)
        .then((job) => {
          setCurrentJob(job);
          setRefreshHistoryKey((n) => n + 1);
        })
        .catch((err: unknown) => {
          setSubmitError(err instanceof Error ? err.message : String(err));
        });
    },
    [createPlanner],
  );

  const handleJobComplete = useCallback((job: JobRecord) => {
    setCurrentJob(job);
    setRefreshHistoryKey((n) => n + 1);
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed right-2 top-1/2 z-40 -translate-y-1/2',
          'flex items-center gap-1.5 rounded-l-lg border border-r-0 border-slate-700/60 bg-slate-800/80 px-2 py-3',
          'text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/80',
        )}
        data-testid="copilot-hub-toggle-open"
        aria-label="Open AI Copilot (Cmd+J)"
      >
        <Sparkles size={14} className="text-blue-400" />
        <ChevronLeft size={12} />
      </button>
    );
  }

  return (
    <aside
      ref={hubRef}
      className={cn(
        'fixed right-0 top-0 z-40 flex h-full w-[360px] flex-col',
        'border-l border-slate-700/60 bg-slate-900/95 backdrop-blur',
      )}
      data-testid="copilot-hub"
      aria-label="AI Copilot command center"
    >
      <header className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
        <Sparkles size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-slate-100">AI Copilot</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
          aria-label="Close AI Copilot (Cmd+J)"
          data-testid="copilot-hub-toggle-close"
        >
          <ChevronRight size={14} />
        </button>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <PromptInput onSubmit={handlePromptSubmit} disabled={submitting} />

        {submitError ? (
          <p
            className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
            data-testid="copilot-hub-submit-error"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        {currentJob ? (
          <section
            className="flex flex-col gap-2 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3"
            data-testid="copilot-hub-current-job"
          >
            <h3 className="text-xs font-semibold text-slate-300">Current job</h3>
            <JobProgress jobId={currentJob.id} onComplete={handleJobComplete} />
          </section>
        ) : null}

        <History key={refreshHistoryKey} onReopen={handleReopen} onBranch={handleBranch} />
      </div>
    </aside>
  );
}
