/**
 * ConfidenceBadge — tests.
 *
 * Per Wave 6 §S6.12: render with score=85, verify display.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { LocaleProvider } from '../../lib/locale';

function renderBadge(props: Parameters<typeof ConfidenceBadge>[0]) {
  return render(
    <LocaleProvider locale="en">
      <ConfidenceBadge {...props} />
    </LocaleProvider>,
  );
}

describe('ConfidenceBadge', () => {
  it('renders the score and the High label for score >= 85', () => {
    renderBadge({ score: 85 });
    const chip = screen.getByTestId('confidence-badge-chip');
    expect(chip).toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge-score')).toHaveTextContent('85%');
    expect(screen.getByTestId('confidence-badge-label')).toHaveTextContent('High');
    expect(chip).toHaveAttribute('data-score', '85');
  });

  it('renders Medium for score in 60-84', () => {
    renderBadge({ score: 72 });
    expect(screen.getByTestId('confidence-badge-label')).toHaveTextContent('Medium');
  });

  it('renders Low for score in 30-59', () => {
    renderBadge({ score: 45 });
    expect(screen.getByTestId('confidence-badge-label')).toHaveTextContent('Low');
  });

  it('renders Inferential for score < 30', () => {
    renderBadge({ score: 15 });
    expect(screen.getByTestId('confidence-badge-label')).toHaveTextContent('Inferential');
  });

  it('clamps out-of-range scores to 0-100', () => {
    renderBadge({ score: 150 });
    expect(screen.getByTestId('confidence-badge-score')).toHaveTextContent('100%');
  });

  it('shows provenance on hover', () => {
    renderBadge({ score: 85, provenance: 'finance.reporting/q4', claim: 'Q4 grew 24%' });
    expect(screen.queryByTestId('confidence-badge-provenance')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('confidence-badge-root'));
    expect(screen.getByTestId('confidence-badge-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge-provenance')).toHaveTextContent('finance.reporting/q4');
  });

  it('renders provenance as a link when href is provided', () => {
    renderBadge({
      score: 88,
      provenance: 'wikipedia:company',
      provenanceHref: 'https://example.test/wiki',
    });
    fireEvent.mouseEnter(screen.getByTestId('confidence-badge-root'));
    const link = screen.getByTestId('confidence-badge-provenance');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.test/wiki');
  });

  it('respects a custom label', () => {
    renderBadge({ score: 95, label: 'Data-backed' });
    expect(screen.getByTestId('confidence-badge-label')).toHaveTextContent('Data-backed');
  });
});