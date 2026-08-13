/**
 * StyleLintPanel — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StyleLintPanel } from './StyleLintPanel';
import type { LintIssue, LintReport } from '../../lib/brand-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const ISSUES: readonly LintIssue[] = [
  {
    elementId: 'el-1',
    elementName: 'Shape',
    property: 'fill',
    currentValue: '#ff0000',
    expectedValue: '#33180c',
    tokenId: 'color.brand.primary',
    severity: 'warning',
  },
];

function reportWithIssues(): LintReport {
  return {
    brandKitId: 'brand-acme',
    issues: ISSUES,
    scannedElementCount: 2,
    scannedAtMs: 0,
  };
}

describe('StyleLintPanel', () => {
  it('shows the empty state when there are no issues', async () => {
    const lint = vi.fn().mockResolvedValue({
      brandKitId: 'brand-acme',
      issues: [],
      scannedElementCount: 0,
      scannedAtMs: 0,
    });
    render(<StyleLintPanel brandKitId="brand-acme" elements={[]} onFix={vi.fn()} lint={lint} />);
    await waitFor(() => {
      expect(screen.getByTestId('style-lint-empty')).toBeInTheDocument();
    });
  });

  it('lists issues from the linter', async () => {
    const lint = vi.fn().mockResolvedValue(reportWithIssues());
    render(<StyleLintPanel brandKitId="brand-acme" elements={[]} onFix={vi.fn()} lint={lint} />);
    await waitFor(() => {
      expect(screen.getByTestId('style-lint-row-el-1')).toBeInTheDocument();
    });
    expect(lint).toHaveBeenCalledWith('brand-acme', []);
  });

  it('emits onFix with the right element id + issue', async () => {
    const lint = vi.fn().mockResolvedValue(reportWithIssues());
    const onFix = vi.fn();
    render(<StyleLintPanel brandKitId="brand-acme" elements={[]} onFix={onFix} lint={lint} />);
    await waitFor(() => {
      expect(screen.getByTestId('style-lint-fix-el-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('style-lint-fix-el-1'));
    expect(onFix).toHaveBeenCalledWith('el-1', ISSUES[0]);
  });

  it('disables the Fix button after a fix', async () => {
    const lint = vi.fn().mockResolvedValue(reportWithIssues());
    render(<StyleLintPanel brandKitId="brand-acme" elements={[]} onFix={vi.fn()} lint={lint} />);
    await waitFor(() => {
      expect(screen.getByTestId('style-lint-fix-el-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('style-lint-fix-el-1'));
    expect(screen.getByTestId('style-lint-fix-el-1')).toBeDisabled();
  });

  it('shows the summary line after a lint run', async () => {
    const lint = vi.fn().mockResolvedValue(reportWithIssues());
    render(<StyleLintPanel brandKitId="brand-acme" elements={[]} onFix={vi.fn()} lint={lint} />);
    await waitFor(() => {
      expect(screen.getByTestId('style-lint-summary')).toHaveTextContent('1 issue · 2 scanned');
    });
  });
});
