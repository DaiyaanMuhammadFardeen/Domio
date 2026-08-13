import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaPanel } from './media-panel';

function defaultProps(overrides?: Partial<React.ComponentProps<typeof MediaPanel>>) {
  return {
    selectedKind: null,
    selectedProps: null,
    onPropEdit: vi.fn(),
    onInsert: vi.fn(),
    ...overrides,
  };
}

describe('MediaPanel', () => {
  it('renders the panel title', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-media-panel')).toBeInTheDocument();
  });

  it('renders all 8 tab buttons', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-tab-model3d')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-video')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-audio')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-lottie')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-embed')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-codeBlock')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-latex')).toBeInTheDocument();
    expect(screen.getByTestId('p11-tab-map')).toBeInTheDocument();
  });

  it('defaults to 3D tab', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-3d-tab')).toBeInTheDocument();
  });

  it('shows drop zone on 3D tab', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-3d-dropzone')).toBeInTheDocument();
  });

  it('shows demo models on 3D tab', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-3d-model-model-demo-1')).toBeInTheDocument();
    expect(screen.getByTestId('p11-3d-model-model-demo-2')).toBeInTheDocument();
  });

  it('calls onInsert when clicking a 3D model', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-3d-model-model-demo-1'));
    expect(onInsert).toHaveBeenCalledWith(
      'model3d',
      expect.objectContaining({ name: 'Damaged Helmet' }),
    );
  });

  it('switches to video tab and shows video assets', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-video'));
    expect(screen.getByTestId('p11-video-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-video-asset-video-demo-1')).toBeInTheDocument();
  });

  it('calls onInsert when clicking a video asset', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-tab-video'));
    fireEvent.click(screen.getByTestId('p11-video-asset-video-demo-1'));
    expect(onInsert).toHaveBeenCalledWith(
      'video',
      expect.objectContaining({ name: 'Product Reveal' }),
    );
  });

  it('switches to audio tab and shows audio assets', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-audio'));
    expect(screen.getByTestId('p11-audio-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-audio-asset-audio-demo-1')).toBeInTheDocument();
  });

  it('switches to lottie tab and shows lottie assets', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-lottie'));
    expect(screen.getByTestId('p11-lottie-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-lottie-asset-lottie-demo-1')).toBeInTheDocument();
  });

  it('switches to embed tab and shows URL input', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-embed'));
    expect(screen.getByTestId('p11-embed-url')).toBeInTheDocument();
    expect(screen.getByTestId('p11-embed-insert')).toBeInTheDocument();
  });

  it('calls onInsert when inserting an embed with URL', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-tab-embed'));
    fireEvent.change(screen.getByTestId('p11-embed-url'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByTestId('p11-embed-insert'));
    expect(onInsert).toHaveBeenCalledWith(
      'embed',
      expect.objectContaining({ url: 'https://example.com' }),
    );
  });

  it('disables embed insert when URL is empty', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-embed'));
    expect(screen.getByTestId('p11-embed-insert')).toBeDisabled();
  });

  it('switches to code tab and shows language selector', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-codeBlock'));
    expect(screen.getByTestId('p11-code-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-code-language')).toBeInTheDocument();
    expect(screen.getByTestId('p11-code-source')).toBeInTheDocument();
  });

  it('calls onInsert when inserting a code block', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-tab-codeBlock'));
    fireEvent.change(screen.getByTestId('p11-code-source'), {
      target: { value: 'console.log("hello")' },
    });
    fireEvent.click(screen.getByTestId('p11-code-insert'));
    expect(onInsert).toHaveBeenCalledWith(
      'codeBlock',
      expect.objectContaining({
        code: 'console.log("hello")',
        language: 'javascript',
      }),
    );
  });

  it('switches to LaTeX tab and shows source input', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-latex'));
    expect(screen.getByTestId('p11-latex-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-latex-source')).toBeInTheDocument();
    expect(screen.getByTestId('p11-latex-display-mode')).toBeInTheDocument();
  });

  it('calls onInsert when inserting LaTeX', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-tab-latex'));
    fireEvent.change(screen.getByTestId('p11-latex-source'), { target: { value: 'E = mc^2' } });
    fireEvent.click(screen.getByTestId('p11-latex-insert'));
    expect(onInsert).toHaveBeenCalledWith('latex', expect.objectContaining({ source: 'E = mc^2' }));
  });

  it('switches to map tab and shows map controls', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-map'));
    expect(screen.getByTestId('p11-map-tab')).toBeInTheDocument();
    expect(screen.getByTestId('p11-map-zoom')).toBeInTheDocument();
    expect(screen.getByTestId('p11-map-lat')).toBeInTheDocument();
    expect(screen.getByTestId('p11-map-lng')).toBeInTheDocument();
    expect(screen.getByTestId('p11-map-insert')).toBeInTheDocument();
  });

  it('calls onInsert when inserting a map', () => {
    const onInsert = vi.fn();
    render(<MediaPanel {...defaultProps()} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('p11-tab-map'));
    fireEvent.click(screen.getByTestId('p11-map-insert'));
    expect(onInsert).toHaveBeenCalledWith(
      'map',
      expect.objectContaining({
        styleId: 'mapbox-light',
        zoom: 10,
        center: expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
      }),
    );
  });

  it('renders 3D settings controls', () => {
    render(<MediaPanel {...defaultProps()} />);
    expect(screen.getByTestId('p11-3d-auto-rotate')).toBeInTheDocument();
    expect(screen.getByTestId('p11-3d-paused')).toBeInTheDocument();
    expect(screen.getByTestId('p11-3d-up-axis')).toBeInTheDocument();
  });

  it('renders video settings controls', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-video'));
    expect(screen.getByTestId('p11-video-speed')).toBeInTheDocument();
    expect(screen.getByTestId('p11-video-muted')).toBeInTheDocument();
    expect(screen.getByTestId('p11-video-loop')).toBeInTheDocument();
    expect(screen.getByTestId('p11-video-captions')).toBeInTheDocument();
  });

  it('renders audio settings controls', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-audio'));
    expect(screen.getByTestId('p11-audio-volume')).toBeInTheDocument();
    expect(screen.getByTestId('p11-audio-pan')).toBeInTheDocument();
    expect(screen.getByTestId('p11-audio-fade-in')).toBeInTheDocument();
    expect(screen.getByTestId('p11-audio-fade-out')).toBeInTheDocument();
  });

  it('renders lottie settings controls', () => {
    render(<MediaPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p11-tab-lottie'));
    expect(screen.getByTestId('p11-lottie-autoplay')).toBeInTheDocument();
    expect(screen.getByTestId('p11-lottie-loop')).toBeInTheDocument();
    expect(screen.getByTestId('p11-lottie-speed')).toBeInTheDocument();
  });
});
