'use client';

/**
 * DryRunPreview — Wave 10 §S10.10 dry-run preview surface.
 *
 * The agent proposes a structured diff (§#240). The preview pane
 * renders added / changed / removed elements grouped by op, with a
 * summary header and Approve / Reject controls. Approving applies the
 * diff; rejecting discards it. The component is purely view + intent:
 * it delegates fetching and side-effects to the parent and to
 * `agent-diff-service`.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  approveDiff,
  rejectDiff,
  type AgentDiff,
  type DiffItem,
} from '../../../lib/agent-diff-service';
import { DiffSection } from './DiffSection';

export interface DryRunPreviewProps {
  /** The proposed diff to render. `null` means "no pending diff". */
  readonly diff: AgentDiff | null;
  /** Invoked when the user confirms the diff should be applied. */
  readonly onApprove: (appliedAtMs: number) => void;
  /** Invoked when the user discards the diff. */
  readonly onReject: () => void;
  /** Optional API base URL override (used in tests). */
  readonly baseUrl?: string;
  /** Optional explicit loading state (used when the parent is fetching). */
  readonly loading?: boolean;
  /** Optional explicit error state. */
  readonly error?: string | null;
  readonly dataTestId?: string;
}

function groupBy(items: ReadonlyArray<DiffItem>): {
  added: DiffItem[];
  changed: DiffItem[];
  removed: DiffItem[];
} {
  const added: DiffItem[] = [];
  const changed: DiffItem[] = [];
  const removed: DiffItem[] = [];
  for (const item of items) {
    if (item.op === 'add') added.push(item);
    else if (item.op === 'change') changed.push(item);
    else removed.push(item);
  }
  return { added, changed, removed };
}

export function DryRunPreview({
  diff,
  onApprove,
  onReject,
  baseUrl,
  loading = false,
  error = null,
  dataTestId = 'agent-diff-preview',
}: DryRunPreviewProps): ReactElement {
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { added, changed, removed } = useMemo(() => groupBy(diff?.items ?? []), [diff]);

  const isApplied = diff?.applied_at_ms !== undefined;
  const disabled = diff === null || isApplied || submitting !== null || loading;

  const onClickApprove = async (): Promise<void> => {
    if (diff === null) return;
    setSubmitError(null);
    setSubmitting('approve');
    try {
      const res = await approveDiff(diff.id, baseUrl);
      onApprove(res.applied_at_ms);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'approve failed');
    } finally {
      setSubmitting(null);
    }
  };

  const onClickReject = async (): Promise<void> => {
    if (diff === null) return;
    setSubmitError(null);
    setSubmitting('reject');
    try {
      await rejectDiff(diff.id, baseUrl);
      onReject();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'reject failed');
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div data-testid={`${dataTestId}-loading`} role="status" aria-live="polite">
        <FormattedMessage id="editor.agent.dryRun.heading" as="h2" />
        <p>…</p>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div data-testid={`${dataTestId}-error`} role="alert">
        <FormattedMessage id="editor.agent.dryRun.heading" as="h2" />
        <p data-testid={`${dataTestId}-error-message`}>{error}</p>
      </div>
    );
  }

  if (diff === null) {
    return (
      <div data-testid={`${dataTestId}-empty`} role="status">
        <FormattedMessage id="editor.agent.dryRun.heading" as="h2" />
        <p>
          <FormattedMessage id="editor.agent.dryRun.empty" />
        </p>
      </div>
    );
  }

  return (
    <section data-testid={dataTestId} aria-label="Dry-run preview">
      <header>
        <FormattedMessage id="editor.agent.dryRun.heading" as="h2" />
        <p data-testid={`${dataTestId}-meta`}>
          <span data-testid={`${dataTestId}-agent`}>{diff.agent_name}</span>
        </p>
        <p data-testid={`${dataTestId}-summary`}>
          <FormattedMessage
            id="editor.agent.dryRun.summary"
            values={{
              added: added.length,
              changed: changed.length,
              removed: removed.length,
            }}
          />
        </p>
      </header>

      <DiffSection kind="add" items={added} dataTestId={`${dataTestId}-added`} />
      <DiffSection kind="change" items={changed} dataTestId={`${dataTestId}-changed`} />
      <DiffSection kind="remove" items={removed} dataTestId={`${dataTestId}-removed`} />

      {submitError !== null ? (
        <p data-testid={`${dataTestId}-submit-error`} role="alert">
          {submitError}
        </p>
      ) : null}

      <footer>
        <button
          type="button"
          data-testid={`${dataTestId}-approve`}
          onClick={onClickApprove}
          disabled={disabled}
        >
          <FormattedMessage id="editor.agent.dryRun.approve" />
        </button>
        <button
          type="button"
          data-testid={`${dataTestId}-reject`}
          onClick={onClickReject}
          disabled={disabled}
        >
          <FormattedMessage id="editor.agent.dryRun.reject" />
        </button>
        {isApplied ? (
          <span data-testid={`${dataTestId}-approved`} role="status">
            <FormattedMessage id="editor.agent.dryRun.approved" />
          </span>
        ) : null}
      </footer>
    </section>
  );
}
