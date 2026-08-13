/**
 * CodeBlockEditor — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlockEditor } from './CodeBlockEditor';

describe('CodeBlockEditor', () => {
  it('renders the source editor and run button', () => {
    render(<CodeBlockEditor />);
    expect(screen.getByTestId('code-block-source')).toBeInTheDocument();
    expect(screen.getByTestId('code-block-run')).toBeInTheDocument();
  });

  it('runs JS and shows output', async () => {
    render(<CodeBlockEditor initialSource="console.log('hi');" language="js" />);
    fireEvent.click(screen.getByTestId('code-block-run'));
    await waitFor(() => {
      expect(screen.getByTestId('code-block-output')).toBeInTheDocument();
    });
    expect(screen.getByTestId('code-block-output')).toHaveTextContent('hi');
  });

  it('reports errors', async () => {
    render(<CodeBlockEditor initialSource="throw new Error('boom')" language="js" />);
    fireEvent.click(screen.getByTestId('code-block-run'));
    await waitFor(() => {
      expect(screen.getByTestId('code-block-stderr')).toBeInTheDocument();
    });
    expect(screen.getByTestId('code-block-stderr')).toHaveTextContent('boom');
  });

  it('emits onResult when a run completes', async () => {
    const onResult = vi.fn();
    render(<CodeBlockEditor initialSource="1+1" language="js" onResult={onResult} />);
    fireEvent.click(screen.getByTestId('code-block-run'));
    await waitFor(() => {
      expect(onResult).toHaveBeenCalled();
    });
  });
});
