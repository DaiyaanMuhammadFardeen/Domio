'use client';

/**
 * FormattedMessage — i18n message renderer with placeholder substitution.
 *
 * Per Wave 1 §S1.8 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Usage:
 *   <FormattedMessage id="editor.deckList.empty.title" />
 *   <FormattedMessage id="editor.deckList.empty.cta" values={{ name: 'Acme' }} />
 *
 * Falls back to the key when no translation is found. Placeholders use
 * ICU-lite syntax: `{name}` substitutes `values.name`. Nested values
 * (`{user.name}`) are not supported in this minimal version.
 */

import { type ReactElement } from 'react';

import { useLocale } from './useLocale.js';

export interface FormattedMessageProps {
  id: string;
  /** Map of placeholder -> value. */
  values?: Readonly<Record<string, string | number>>;
  /**
   * Optional explicit catalogue (overrides the one from useLocale context).
   * Useful for app-level message bundles.
   */
  catalogue?: Readonly<Record<string, string>>;
  /** Render the resolved message inside an element. Default = fragment. */
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label';
  className?: string;
  style?: React.CSSProperties;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function substitute(
  template: string,
  values: Readonly<Record<string, string | number>> | undefined,
): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const v = values[key];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
    return match;
  });
}

export function FormattedMessage(props: FormattedMessageProps): ReactElement {
  const { id, values, catalogue, as, className, style } = props;
  const { t } = useLocale(catalogue);
  const resolved = substitute(t(id, id), values);
  const Element = as ?? 'span';
  return (
    <Element className={className} style={style}>
      {resolved}
    </Element>
  );
}
