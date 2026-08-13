'use client';

/**
 * DiffItem — single structured diff row.
 *
 * Per Wave 10 §S10.10 of docs/frontend-roadmap/10-wave-agentic-programmable.md.
 * Shows the affected target (slide id or element id), an op badge
 * (added/changed/removed), and — for `change` ops — side-by-side
 * before / after previews of the affected payload.
 */

import { type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import type { DiffItem } from '../../../lib/agent-diff-service';

export interface DiffItemRowProps {
  readonly item: DiffItem;
  readonly dataTestId?: string;
}

function stringify(value: Record<string, unknown> | undefined): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function PreviewBlock({
  labelId,
  payload,
  testId,
}: {
  labelId: string;
  payload: Record<string, unknown> | undefined;
  testId: string;
}): ReactElement {
  const text = stringify(payload);
  return (
    <div data-testid={testId} className="diff-item__preview">
      <FormattedMessage id={labelId} as="span" />
      <code>{text}</code>
    </div>
  );
}

export function DiffItemRow({
  item,
  dataTestId = 'agent-diff-item',
}: DiffItemRowProps): ReactElement {
  const targetKindId =
    item.target_kind === 'slide'
      ? 'editor.agent.dryRun.item.kind.slide'
      : 'editor.agent.dryRun.item.kind.element';
  const opId =
    item.op === 'add'
      ? 'editor.agent.dryRun.item.op.add'
      : item.op === 'change'
        ? 'editor.agent.dryRun.item.op.change'
        : 'editor.agent.dryRun.item.op.remove';

  return (
    <li
      data-testid={dataTestId}
      data-op={item.op}
      data-target-kind={item.target_kind}
      data-target={item.target}
      aria-label={`${item.target_kind} ${item.target}`}
    >
      <div className="diff-item__row">
        <span data-testid="agent-diff-item-target-kind">
          <FormattedMessage id={targetKindId} />
        </span>
        <span data-testid="agent-diff-item-target">{item.target}</span>
        <span data-testid="agent-diff-item-op-badge" data-op={item.op}>
          <FormattedMessage id={opId} />
        </span>
      </div>
      <p data-testid="agent-diff-item-summary">{item.summary}</p>
      {item.op === 'change' ? (
        <div className="diff-item__pair">
          <PreviewBlock
            labelId="editor.agent.dryRun.item.before"
            payload={item.before}
            testId="agent-diff-item-before"
          />
          <PreviewBlock
            labelId="editor.agent.dryRun.item.after"
            payload={item.after}
            testId="agent-diff-item-after"
          />
        </div>
      ) : item.op === 'add' ? (
        <PreviewBlock
          labelId="editor.agent.dryRun.item.after"
          payload={item.after}
          testId="agent-diff-item-after"
        />
      ) : (
        <PreviewBlock
          labelId="editor.agent.dryRun.item.before"
          payload={item.before}
          testId="agent-diff-item-before"
        />
      )}
    </li>
  );
}