import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionsPanel } from './connections-panel';

function defaultProps(overrides: Partial<React.ComponentProps<typeof ConnectionsPanel>> = {}): React.ComponentProps<typeof ConnectionsPanel> {
  const slides = [
    { id: 's1', elements: [], backgrounds: [] },
    { id: 's2', elements: [], backgrounds: [] },
  ];
  return {
    slides,
    activeSlideId: 's1',
    hotspots: [],
    overlays: [],
    edges: [],
    onAddHotspot: vi.fn(),
    onRemoveHotspot: vi.fn(),
    onAddEdge: vi.fn(),
    onRemoveEdge: vi.fn(),
    onAddOverlay: vi.fn(),
    onRemoveOverlay: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof ConnectionsPanel>;
}

describe('ConnectionsPanel', () => {
  it('renders the panel header', () => {
    render(<ConnectionsPanel {...defaultProps()} />);
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('renders all four tabs', () => {
    render(<ConnectionsPanel {...defaultProps()} />);
    expect(screen.getByTestId('p10-tab-hotspots')).toHaveTextContent('Hotspots');
    expect(screen.getByTestId('p10-tab-edges')).toHaveTextContent('Branching');
    expect(screen.getByTestId('p10-tab-overlays')).toHaveTextContent('Overlays');
    expect(screen.getByTestId('p10-tab-graph')).toHaveTextContent('Graph');
  });

  it('switches tabs', () => {
    render(<ConnectionsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p10-tab-edges'));
    expect(screen.getByTestId('p10-edge-list')).toBeInTheDocument();
  });

  it('adds a hotspot with the selected target slide', () => {
    const onAddHotspot = vi.fn();
    render(<ConnectionsPanel {...defaultProps()} onAddHotspot={onAddHotspot} />);
    fireEvent.change(screen.getByTestId('p10-hotspot-target'), { target: { value: 's2' } });
    fireEvent.click(screen.getByTestId('p10-hotspot-add'));
    expect(onAddHotspot).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        targetType: 'slide',
        targetRef: { slideId: 's2' },
      }),
    );
  });

  it('removes a hotspot', () => {
    const onRemoveHotspot = vi.fn();
    render(
      <ConnectionsPanel
        {...defaultProps({
          hotspots: [{
            id: 'h1',
            name: 'Next',
            geometry: { kind: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 },
            gestureMask: ['click'],
            targetType: 'slide',
            targetRef: { slideId: 's2' },
            status: 'ok',
          }],
          onRemoveHotspot,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-hotspot-remove'));
    expect(onRemoveHotspot).toHaveBeenCalledWith('h1');
  });

  it('shows the empty hotspots message when none exist', () => {
    render(<ConnectionsPanel {...defaultProps()} />);
    expect(screen.getByText('No hotspots on this slide.')).toBeInTheDocument();
  });

  it('adds a branching edge with optional rule id', () => {
    const onAddEdge = vi.fn();
    render(<ConnectionsPanel {...defaultProps()} onAddEdge={onAddEdge} />);
    fireEvent.click(screen.getByTestId('p10-tab-edges'));
    fireEvent.change(screen.getByTestId('p10-edge-rule'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByTestId('p10-edge-add'));
    expect(onAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({ fromSlideId: 's1', ruleId: 'r1' }),
    );
  });

  it('removes an edge', () => {
    const onRemoveEdge = vi.fn();
    render(
      <ConnectionsPanel
        {...defaultProps({
          edges: [{
            id: 'e1', fromSlideId: 's1', toSlideId: 's2', name: 'Go', ruleId: null, priority: 0,
          }],
          onRemoveEdge,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-tab-edges'));
    fireEvent.click(screen.getByTestId('p10-edge-remove'));
    expect(onRemoveEdge).toHaveBeenCalledWith('e1');
  });

  it('adds an overlay', () => {
    const onAddOverlay = vi.fn();
    render(<ConnectionsPanel {...defaultProps()} onAddOverlay={onAddOverlay} />);
    fireEvent.click(screen.getByTestId('p10-tab-overlays'));
    fireEvent.click(screen.getByTestId('p10-overlay-add'));
    expect(onAddOverlay).toHaveBeenCalledWith('s1', expect.objectContaining({ type: 'modal' }));
  });

  it('runs graph validation', () => {
    render(<ConnectionsPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p10-tab-graph'));
    fireEvent.click(screen.getByTestId('p10-graph-validate'));
    expect(screen.getByTestId('p10-graph-report')).toHaveTextContent('Has cycle: no');
  });

  it('flags a cycle in graph validation', () => {
    render(
      <ConnectionsPanel
        {...defaultProps({
          edges: [
            { id: 'e1', fromSlideId: 's1', toSlideId: 's2', name: 'a', ruleId: null, priority: 0 },
            { id: 'e2', fromSlideId: 's2', toSlideId: 's1', name: 'b', ruleId: null, priority: 0 },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-tab-graph'));
    fireEvent.click(screen.getByTestId('p10-graph-validate'));
    expect(screen.getByTestId('p10-graph-report')).toHaveTextContent('Has cycle: yes');
  });
});