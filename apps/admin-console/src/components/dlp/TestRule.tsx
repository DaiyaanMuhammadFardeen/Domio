'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import type { DLPRule, DLPTestResult } from '../../lib/types';

export interface TestRuleProps {
  rule: DLPRule | null;
  onTest: (result: DLPTestResult) => void;
}

interface HighlightSegment {
  text: string;
  highlight: boolean;
}

/**
 * Render text with matching substrings wrapped in a highlight span.
 * Snippets must be sorted by start and non-overlapping for clean
 * rendering — caller (the service) guarantees this.
 */
function highlightText(text: string, matches: ReadonlyArray<{ start: number; end: number }>): HighlightSegment[] {
  if (matches.length === 0) return [{ text, highlight: false }];
  const out: HighlightSegment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      out.push({ text: text.slice(cursor, m.start), highlight: false });
    }
    out.push({ text: text.slice(m.start, m.end), highlight: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), highlight: false });
  }
  return out;
}

const SAMPLE_TEXTS: ReadonlyArray<string> = [
  'Reach me at jane.doe@example.com or 415-555-1234.',
  'SSN on file: 123-45-6789 — please keep this confidential.',
  'Card number 4111 1111 1111 1111 expires 12/27.',
];

/**
 * Tester pane. When a rule is selected, admins can paste a sample
 * string and see matches rendered with their snippets highlighted.
 */
export function TestRule({ rule, onTest }: TestRuleProps) {
  const [text, setText] = useState<string>(SAMPLE_TEXTS[0] ?? '');
  const [result, setResult] = useState<DLPTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRun() {
    if (!rule) return;
    setBusy(true);
    try {
      // Lazy import so the test pane stays decoupled from the service.
      const { testDLPRule } = await import('../../lib/dlp-service');
      const r = await testDLPRule(rule, text);
      setResult(r);
      onTest(r);
    } finally {
      setBusy(false);
    }
  }

  if (!rule) {
    return (
      <div
        data-testid="test-rule"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm"
      >
        Select a rule on the left to test it against sample text.
      </div>
    );
  }

  const segments = result ? highlightText(text, result.matches) : [];

  return (
    <div
      data-testid="test-rule"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Test rule
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Pattern:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
            {rule.pattern}
          </code>{' '}
          <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {rule.kind}
          </span>
        </p>
      </div>

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Sample text
        </span>
        <textarea
          data-testid="test-rule-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          data-testid="test-rule-run"
          className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Running…' : 'Run test'}
        </button>
        <div className="flex flex-wrap gap-1">
          {SAMPLE_TEXTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setText(sample)}
              className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
            >
              Sample {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div data-testid="test-rule-result" className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span
              className={clsx(
                'inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide',
                result.matched
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-emerald-50 text-emerald-700',
              )}
            >
              {result.matched
                ? `Matched ${result.matches.length} occurrence(s)`
                : 'No matches'}
            </span>
            <span data-testid="test-rule-latency" className="text-slate-500">
              Took {result.latency_ms.toFixed(1)}ms
            </span>
          </div>

          {segments.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed">
              {segments.map((seg, i) =>
                seg.highlight ? (
                  <mark
                    key={i}
                    data-testid={`test-rule-match-${i}`}
                    className="rounded bg-amber-200 px-0.5 text-amber-900"
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </div>
          )}

          {result.matches.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-600">
              {result.matches.map((m, i) => (
                <li key={i} className="flex items-center gap-3 font-mono">
                  <span className="w-12 text-right tabular-nums text-slate-400">
                    {m.start}-{m.end}
                  </span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
                    {m.snippet}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}