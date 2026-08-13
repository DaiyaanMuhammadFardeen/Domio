'use client';

/**
 * QuickstartCode — styled code block with copy-to-clipboard.
 *
 * Per Wave 8 §S8.10. Used on the Component SDK landing to display
 * install / "hello world" snippets.
 */

import { useState, type ReactElement } from 'react';
import { Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';

export type QuickstartLanguage = 'bash' | 'typescript' | 'python';

export interface QuickstartCodeProps {
  readonly code: string;
  readonly language: QuickstartLanguage;
  readonly label?: string;
}

export function QuickstartCode({
  code,
  language,
  label,
}: QuickstartCodeProps): ReactElement {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — ignore
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-400">
            {language}
          </span>
          {label && <span className="text-slate-400">{label}</span>}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          data-testid="quickstart-code-copy"
          aria-label="Copy code to clipboard"
          className={clsx(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition',
            copied
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden /> Copy
            </>
          )}
        </button>
      </div>
      <pre
        data-testid="quickstart-code"
        className="overflow-x-auto px-4 py-3 text-xs leading-relaxed"
      >
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}