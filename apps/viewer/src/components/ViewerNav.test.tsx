/**
 * Viewer chrome tests — ViewerNav + ViewerProgress + ViewerHelp +
 * OverviewGrid + SlideStage + ViewerShell.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewerNav } from './ViewerNav';
import { ViewerProgress } from './ViewerProgress';
import { ViewerHelp } from './ViewerHelp';
import { OverviewGrid } from './OverviewGrid';
import { SlideStage } from './SlideStage';
import { ViewerShell } from './ViewerShell';
import exampleDeck from '../../../../fixtures/example-deck.json' with { type: 'json' };
import type { DeckDocument } from '@domio/schema/generated/scene-graph';

const deck = exampleDeck as unknown as DeckDocument;

describe('ViewerNav', () => {
  it('renders the counter and disables prev at slide 1', () => {
    render(
      <ViewerNav
        currentIdx={0}
        slideCount={5}
        mode="stage"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleOverview={vi.fn()}
        onToggleHelp={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );
    expect(screen.getByTestId('viewer-nav-counter').textContent).toBe('1 / 5');
    expect(screen.getByTestId('viewer-nav-prev')).toBeDisabled();
    expect(screen.getByTestId('viewer-nav-next')).not.toBeDisabled();
  });

  it('emits onNext when next is clicked', () => {
    const onNext = vi.fn();
    render(
      <ViewerNav
        currentIdx={0}
        slideCount={5}
        mode="stage"
        onPrev={vi.fn()}
        onNext={onNext}
        onToggleOverview={vi.fn()}
        onToggleHelp={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('viewer-nav-next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('disables next at the last slide', () => {
    render(
      <ViewerNav
        currentIdx={4}
        slideCount={5}
        mode="stage"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleOverview={vi.fn()}
        onToggleHelp={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onChangeMode={vi.fn()}
      />,
    );
    expect(screen.getByTestId('viewer-nav-next')).toBeDisabled();
  });

  it('toggles help, overview, and fullscreen via buttons', () => {
    const onHelp = vi.fn();
    const onOverview = vi.fn();
    const onFs = vi.fn();
    render(
      <ViewerNav
        currentIdx={2}
        slideCount={5}
        mode="stage"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleOverview={onOverview}
        onToggleHelp={onHelp}
        onToggleFullscreen={onFs}
        onChangeMode={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('viewer-nav-help'));
    fireEvent.click(screen.getByTestId('viewer-nav-overview'));
    fireEvent.click(screen.getByTestId('viewer-nav-fullscreen'));
    expect(onHelp).toHaveBeenCalled();
    expect(onOverview).toHaveBeenCalled();
    expect(onFs).toHaveBeenCalled();
  });

  it('switches mode on the toggle', () => {
    const onMode = vi.fn();
    render(
      <ViewerNav
        currentIdx={2}
        slideCount={5}
        mode="stage"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onToggleOverview={vi.fn()}
        onToggleHelp={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onChangeMode={onMode}
      />,
    );
    fireEvent.click(screen.getByTestId('viewer-nav-mode'));
    expect(onMode).toHaveBeenCalledWith('scroll');
  });
});

describe('ViewerProgress', () => {
  it('renders a progress bar with the right aria values', () => {
    render(<ViewerProgress currentIdx={1} slideCount={5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
  });

  it('emits onSeek when the input changes', () => {
    const onSeek = vi.fn();
    render(<ViewerProgress currentIdx={0} slideCount={5} onSeek={onSeek} />);
    fireEvent.change(screen.getByTestId('viewer-progress-seek'), { target: { value: '3' } });
    expect(onSeek).toHaveBeenCalledWith(2);
  });
});

describe('ViewerHelp', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ViewerHelp open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the table when open', () => {
    render(<ViewerHelp open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('viewer-help-table')).toBeInTheDocument();
  });

  it('emits onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ViewerHelp open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('viewer-help-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('OverviewGrid', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <OverviewGrid deck={deck} currentIdx={0} open={false} onClose={vi.fn()} onPick={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per slide when open', () => {
    render(
      <OverviewGrid deck={deck} currentIdx={0} open={true} onClose={vi.fn()} onPick={vi.fn()} />,
    );
    const grid = screen.getByTestId('overview-grid-grid');
    const buttons = grid.querySelectorAll('button[data-testid^="overview-grid-slide-"]');
    expect(buttons.length).toBe(deck.slides.length);
  });

  it('emits onPick and onClose when a slide is clicked', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <OverviewGrid deck={deck} currentIdx={0} open={true} onClose={onClose} onPick={onPick} />,
    );
    fireEvent.click(screen.getByTestId('overview-grid-slide-0'));
    expect(onPick).toHaveBeenCalledWith(0);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SlideStage', () => {
  it('renders the slide with a watermark when supplied', () => {
    const slide = deck.slides[0]!;
    render(<SlideStage slide={slide} reducedMotion={false} watermarkText="viewer:abc" />);
    expect(screen.getByTestId('slide-stage')).toBeInTheDocument();
    expect(screen.getByTestId('slide-stage-watermark')).toBeInTheDocument();
  });

  it('renders no watermark when omitted', () => {
    const slide = deck.slides[0]!;
    render(<SlideStage slide={slide} reducedMotion={false} />);
    expect(screen.queryByTestId('slide-stage-watermark')).toBeNull();
  });
});

describe('ViewerShell', () => {
  it('renders the shell and progress', () => {
    render(<ViewerShell deck={deck} dataTestId="viewer" />);
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-progress')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-nav')).toBeInTheDocument();
  });

  it('shows the slide title in the header', () => {
    render(<ViewerShell deck={deck} />);
    expect(screen.getByTestId('viewer-shell-header').textContent).toContain(deck.title);
  });
});
