/**
 * Code block with a one-click copy button.
 *
 * Per Wave 12 §S12.4 every code block on the docs site ships with a
 * copy affordance. This component is a client component so we can use
 * the clipboard API and toggle the "Copied!" feedback. The visual
 * surface is rendered server-side by the surrounding layout; only the
 * button is interactive.
 */

'use client';

import { useEffect, useState, type JSX } from 'react';

export interface CodeBlockProps {
  readonly code: string;
  readonly language?: string;
  readonly filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async (): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="docs-codeblock" data-testid="docs-codeblock">
      <div className="docs-codeblock__header">
        <span className="docs-codeblock__meta">
          {filename ? <span className="docs-codeblock__filename">{filename}</span> : null}
          {language ? <span className="docs-codeblock__language">{language}</span> : null}
        </span>
        <button
          type="button"
          className="docs-codeblock__copy"
          data-testid="docs-copy-button"
          aria-label={copied ? 'Copied to clipboard' : 'Copy code to clipboard'}
          onClick={onCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="docs-codeblock__body">
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </div>
  );
}

export default CodeBlock;
