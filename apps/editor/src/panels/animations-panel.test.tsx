import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnimationsPanel } from './animations-panel';
import type { LayerTimeline, SlideTransition, ReducedMotionPolicy } from '@domio/canvas';

function defaultProps(overrides?: Partial<React.ComponentProps<typeof AnimationsPanel>>) {
  return {
    timeline: null as LayerTimeline | null,
    onTimelineChange: vi.fn(),
    transition: null as SlideTransition | null,
    onTransitionChange: vi.fn(),
    magicRole: null as string | null,
    onMagicRoleChange: vi.fn(),
    hasMatchingRole: false,
    reducedMotion: null as ReducedMotionPolicy | null,
    onReducedMotionChange: vi.fn(),
    copiedAnimation: null as LayerTimeline | null,
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    motionPath: null,
    onMotionPathChange: vi.fn(),
    ...overrides,
  };
}

const sampleTimeline: LayerTimeline = {
  id: 'tl-1',
  durationMs: 1000,
  loop: false,
  playCount: 1,
  startOffsetMs: 0,
  tracks: [
    {
      property: 'opacity',
      keyframes: [
        { timeMs: 0, value: 1 },
        { timeMs: 1000, value: 0 },
      ],
    },
  ],
};

describe('AnimationsPanel', () => {
  it('renders the panel title', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    expect(screen.getByText('Animations')).toBeInTheDocument();
  });

  it('renders all five tabs', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    expect(screen.getByTestId('p09-tab-timeline')).toHaveTextContent('Timeline');
    expect(screen.getByTestId('p09-tab-transition')).toHaveTextContent('Transition');
    expect(screen.getByTestId('p09-tab-magicMove')).toHaveTextContent('Magic Move');
    expect(screen.getByTestId('p09-tab-motionPath')).toHaveTextContent('Motion Path');
    expect(screen.getByTestId('p09-tab-accessibility')).toHaveTextContent('Accessibility');
  });

  it('shows empty timeline state', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    expect(screen.getByText('No timeline configured')).toBeInTheDocument();
  });

  it('shows timeline controls when timeline is provided', () => {
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} />);
    expect(screen.getByTestId('p09-timeline-duration')).toHaveValue(1000);
    expect(screen.getByTestId('p09-track-property-0')).toHaveValue('opacity');
  });

  it('calls onTimelineChange when adding a timeline', () => {
    const onTimelineChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} onTimelineChange={onTimelineChange} />);
    fireEvent.click(screen.getByTestId('p09-add-timeline'));
    expect(onTimelineChange).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 1000, loop: false }),
    );
  });

  it('calls onTimelineChange when adding a track', () => {
    const onTimelineChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} onTimelineChange={onTimelineChange} />);
    fireEvent.click(screen.getByTestId('p09-add-track'));
    expect(onTimelineChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: expect.arrayContaining([
          expect.objectContaining({ property: 'opacity' }),
          expect.objectContaining({ property: 'opacity' }),
        ]),
      }),
    );
  });

  it('calls onCopy when clicking copy', () => {
    const onCopy = vi.fn();
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} onCopy={onCopy} />);
    fireEvent.click(screen.getByTestId('p09-copy-anim'));
    expect(onCopy).toHaveBeenCalled();
  });

  it('calls onPaste when clicking paste', () => {
    const onPaste = vi.fn();
    render(<AnimationsPanel {...defaultProps()} copiedAnimation={sampleTimeline} onPaste={onPaste} />);
    fireEvent.click(screen.getByTestId('p09-paste-anim'));
    expect(onPaste).toHaveBeenCalled();
  });

  it('disables paste when no copied animation', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    const pasteBtn = screen.getByTestId('p09-paste-anim');
    expect(pasteBtn).toBeDisabled();
  });

  it('switches to transition tab and shows kind selector', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p09-tab-transition'));
    expect(screen.getByTestId('p09-transition-kind')).toBeInTheDocument();
  });

  it('shows transition controls when transition is provided', () => {
    const transition: SlideTransition = { kind: 'fade', durationMs: 300 };
    render(<AnimationsPanel {...defaultProps()} transition={transition} />);
    fireEvent.click(screen.getByTestId('p09-tab-transition'));
    expect(screen.getByTestId('p09-transition-kind')).toHaveValue('fade');
    expect(screen.getByTestId('p09-transition-duration')).toHaveValue(300);
  });

  it('calls onTransitionChange when setting a transition', () => {
    const onTransitionChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} onTransitionChange={onTransitionChange} />);
    fireEvent.click(screen.getByTestId('p09-tab-transition'));
    fireEvent.change(screen.getByTestId('p09-transition-kind'), { target: { value: 'slide' } });
    expect(onTransitionChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'slide', durationMs: 300 }),
    );
  });

  it('switches to magic move tab and shows role input', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p09-tab-magicMove'));
    expect(screen.getByTestId('p09-magic-role')).toBeInTheDocument();
  });

  it('shows match note when hasMatchingRole is true', () => {
    render(<AnimationsPanel {...defaultProps()} hasMatchingRole={true} magicRole="hero" />);
    fireEvent.click(screen.getByTestId('p09-tab-magicMove'));
    expect(screen.getByTestId('p09-magic-match-note')).toBeInTheDocument();
  });

  it('calls onMagicRoleChange when typing a role', () => {
    const onMagicRoleChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} onMagicRoleChange={onMagicRoleChange} />);
    fireEvent.click(screen.getByTestId('p09-tab-magicMove'));
    fireEvent.change(screen.getByTestId('p09-magic-role'), { target: { value: 'hero' } });
    expect(onMagicRoleChange).toHaveBeenCalledWith('hero');
  });

  it('switches to accessibility tab and shows radio options', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p09-tab-accessibility'));
    expect(screen.getByTestId('p09-reduced-motion-follow_os')).toBeInTheDocument();
    expect(screen.getByTestId('p09-reduced-motion-always_reduced')).toBeInTheDocument();
    expect(screen.getByTestId('p09-reduced-motion-always_full')).toBeInTheDocument();
  });

  it('calls onReducedMotionChange when selecting a policy', () => {
    const onReducedMotionChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} onReducedMotionChange={onReducedMotionChange} />);
    fireEvent.click(screen.getByTestId('p09-tab-accessibility'));
    fireEvent.click(screen.getByTestId('p09-reduced-motion-always_reduced'));
    expect(onReducedMotionChange).toHaveBeenCalledWith('always_reduced');
  });

  it('shows trigger selector in timeline tab', () => {
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} />);
    expect(screen.getByTestId('p09-trigger-kind')).toBeInTheDocument();
  });

  it('shows timer fields when trigger is on_timer', () => {
    const tlWithTimer: LayerTimeline = {
      ...sampleTimeline,
      trigger: { kind: 'on_timer', seconds: 2, debounceMs: 100 },
    };
    render(<AnimationsPanel {...defaultProps()} timeline={tlWithTimer} />);
    expect(screen.getByTestId('p09-trigger-timer-seconds')).toHaveValue(2);
  });

  it('allows clearing timeline', () => {
    const onTimelineChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} onTimelineChange={onTimelineChange} />);
    fireEvent.click(screen.getByTestId('p09-clear-timeline'));
    expect(onTimelineChange).toHaveBeenCalledWith(null);
  });

  it('renders a Motion Path tab', () => {
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} />);
    expect(screen.getByTestId('p09-tab-motionPath')).toHaveTextContent('Motion Path');
  });

  it('opens the Motion Path Editor when the tab is clicked', () => {
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} />);
    fireEvent.click(screen.getByTestId('p09-tab-motionPath'));
    expect(screen.getByTestId('motion-path-editor')).toBeInTheDocument();
  });

  it('shows the motion-path "add timeline first" empty state when no timeline exists', () => {
    render(<AnimationsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p09-tab-motionPath'));
    expect(screen.getByText(/Add a timeline first/i)).toBeInTheDocument();
  });

  it('expands the per-keyframe bezier editor and renders the easing curves', () => {
    const timelineWithBezierEasing: LayerTimeline = {
      ...sampleTimeline,
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { timeMs: 0, value: 1, easing: 'cubic-bezier(0.42, 0, 0.58, 1)' },
            { timeMs: 1000, value: 0 },
          ],
        },
      ],
    };
    render(<AnimationsPanel {...defaultProps()} timeline={timelineWithBezierEasing} />);
    fireEvent.click(screen.getByTestId('p09-keyframe-bezier-toggle-0-0'));
    expect(screen.getByTestId('p09-keyframe-bezier-editor-0-0')).toBeInTheDocument();
  });

  it('shows the easing dropdown but no bezier editor when the easing is not a bezier', () => {
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} />);
    fireEvent.click(screen.getByTestId('p09-keyframe-bezier-toggle-0-0'));
    // The easing dropdown is always shown when expanded.
    expect(screen.getByTestId('p09-keyframe-easing-select-0-0')).toBeInTheDocument();
    // But the bezier editor is only rendered when the easing is a cubic-bezier.
    expect(screen.queryByTestId('p09-keyframe-bezier-editor-0-0')).toBeNull();
  });

  it('commits easing string when the per-keyframe easing dropdown switches to bezier', () => {
    const onTimelineChange = vi.fn();
    render(<AnimationsPanel {...defaultProps()} timeline={sampleTimeline} onTimelineChange={onTimelineChange} />);
    fireEvent.click(screen.getByTestId('p09-keyframe-bezier-toggle-0-0'));
    fireEvent.change(screen.getByTestId('p09-keyframe-easing-select-0-0'), { target: { value: '__bezier' } });
    expect(onTimelineChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: expect.arrayContaining([
          expect.objectContaining({
            keyframes: expect.arrayContaining([
              expect.objectContaining({ easing: expect.stringContaining('cubic-bezier(') }),
            ]),
          }),
        ]),
      }),
    );
  });
});
