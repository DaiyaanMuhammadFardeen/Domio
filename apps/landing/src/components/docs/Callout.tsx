/**
 * Callout — info / warning / tip surface for inline docs annotations.
 *
 * Server component. The variant controls both the icon and the colour
 * token so authors can drop a Callout anywhere in a page without
 * bringing their own styles.
 */

import type { JSX, ReactNode } from 'react';

export type CalloutVariant = 'info' | 'warn' | 'tip';

export interface CalloutProps {
  readonly variant?: CalloutVariant;
  readonly title?: string;
  readonly children: ReactNode;
}

const DEFAULT_TITLE: Record<CalloutVariant, string> = {
  info: 'Note',
  warn: 'Warning',
  tip: 'Tip',
};

export function Callout({ variant = 'info', title, children }: CalloutProps): JSX.Element {
  const heading = title ?? DEFAULT_TITLE[variant];
  const className = `docs-callout docs-callout--${variant}`;
  return (
    <aside className={className} role="note" data-testid="docs-callout" data-variant={variant}>
      <p className="docs-callout__title">{heading}</p>
      <div className="docs-callout__body">{children}</div>
    </aside>
  );
}

export default Callout;