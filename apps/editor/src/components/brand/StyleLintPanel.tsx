'use client';

/**
 * StyleLintPanel — POST /v1/lint/style and list off-brand elements
 * with one-click fix.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Reads element summaries the host provides, runs the lint against
 * the active brand kit, then renders a fix list. Hitting "Fix" emits
 * the element id + suggested value; the host applies via the engine
 * bridge.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { lintStyle, type LintIssue, type LintReport } from '../../lib/brand-service';

export interface LintElementSummary {
  readonly id: string;
  readonly name: string;
  readonly fill?: string | undefined;
  readonly fontFamily?: string | undefined;
}

export interface StyleLintPanelProps {
  brandKitId: string;
  elements: readonly LintElementSummary[];
  /**
   * Host applies a fix to the element. The host decides what "fix"
   * means; typically it sets fill/fontFamily to `issue.expectedValue`.
   */
  onFix: (elementId: string, issue: LintIssue) => void;
  /** Optional injectable linter for tests. */
  lint?: typeof lintStyle;
  /** Optional test id. */
  id?: string | undefined;
}

export function StyleLintPanel(props: StyleLintPanelProps): ReactElement {
  const { brandKitId, elements, onFix, id } = props;
  const lintImpl = props.lint ?? lintStyle;
  const [report, setReport] = useState<LintReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixedIds, setFixedIds] = useState<ReadonlySet<string>>(new Set());

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await lintImpl(brandKitId, elements);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [brandKitId, elements, lintImpl]);

  useEffect(() => {
    // Auto-lint when the brand kit or element list changes.
    run();
  }, [run]);

  const handleFix = useCallback(
    (issue: LintIssue) => {
      onFix(issue.elementId, issue);
      setFixedIds((prev) => new Set(prev).add(`${issue.elementId}:${issue.property}`));
    },
    [onFix],
  );

  return (
    <section className="style-lint" data-testid={id ?? 'style-lint'}>
      <header className="style-lint__head">
        <h3 className="style-lint__title">Style lint</h3>
        <p className="style-lint__sub">
          Scans elements for off-brand colors + fonts. Click Fix to align with the active brand kit.
        </p>
      </header>

      <div className="style-lint__actions">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="style-lint__run"
          data-testid="style-lint-run"
        >
          {running ? 'Linting…' : 'Re-run lint'}
        </button>
        {report && (
          <span className="style-lint__summary" data-testid="style-lint-summary">
            {report.issues.length} issue{report.issues.length === 1 ? '' : 's'} · {report.scannedElementCount} scanned
          </span>
        )}
      </div>

      {error && (
        <div className="style-lint__error" data-testid="style-lint-error">{error}</div>
      )}

      {report && report.issues.length === 0 && (
        <div className="style-lint__empty" data-testid="style-lint-empty">
          All elements conform to {brandKitId}.
        </div>
      )}

      <ul className="style-lint__list" data-testid="style-lint-list">
        {report?.issues.map((issue) => {
          const key = `${issue.elementId}:${issue.property}`;
          const fixed = fixedIds.has(key);
          return (
            <li
              key={key}
              className={`style-lint__row${fixed ? ' is-fixed' : ''}`}
              data-testid={`style-lint-row-${issue.elementId}`}
            >
              <span className="style-lint__sev">{issue.severity}</span>
              <span className="style-lint__element">{issue.elementName}</span>
              <span className="style-lint__property">{issue.property}</span>
              <span className="style-lint__diff">
                <code>{issue.currentValue}</code>
                <span aria-hidden>→</span>
                <code>{issue.expectedValue}</code>
              </span>
              <button
                type="button"
                onClick={() => handleFix(issue)}
                disabled={fixed}
                data-testid={`style-lint-fix-${issue.elementId}`}
              >
                {fixed ? 'Fixed' : 'Fix'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
