'use client';

/**
 * DiffSection — list of `DiffItem` rows for a single op kind
 * (added / changed / removed). Used by the DryRunPreview surface
 * (Wave 10 §S10.10) to group structured diffs by operation.
 */

import { type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import { type DiffItem } from '../../../lib/agent-diff-service';
import { DiffItemRow } from './DiffItem';

export type DiffSectionKind = 'add' | 'change' | 'remove';

export interface DiffSectionProps {
  readonly kind: DiffSectionKind;
  readonly items: ReadonlyArray<DiffItem>;
  readonly dataTestId?: string;
}

function headingIdFor(kind: DiffSectionKind): string {
  switch (kind) {
    case 'add':
      return 'editor.agent.dryRun.section.added';
    case 'change':
      return 'editor.agent.dryRun.section.changed';
    case 'remove':
      return 'editor.agent.dryRun.section.removed';
  }
}

export function DiffSection({
  kind,
  items,
  dataTestId = 'agent-diff-section',
}: DiffSectionProps): ReactElement | null {
  if (items.length === 0) return null;
  const headingId = headingIdFor(kind);
  return (
    <section data-testid={dataTestId} data-kind={kind} aria-labelledby={`${dataTestId}-heading`}>
      <h3 data-testid={`${dataTestId}-heading`}>
        <FormattedMessage id={headingId} />
        <span data-testid={`${dataTestId}-count`}> ({items.length})</span>
      </h3>
      <ul data-testid={`${dataTestId}-list`}>
        {items.map((item) => (
          <DiffItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
