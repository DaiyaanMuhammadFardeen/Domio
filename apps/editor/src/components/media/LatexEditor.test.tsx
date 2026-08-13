/**
 * LatexEditor — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LatexEditor } from './LatexEditor';

describe('LatexEditor', () => {
  it('renders the source + preview areas', () => {
    render(<LatexEditor />);
    expect(screen.getByTestId('latex-source')).toBeInTheDocument();
    expect(screen.getByTestId('latex-preview')).toBeInTheDocument();
  });

  it('renders a preview after the debounce', async () => {
    render(<LatexEditor initialSource="x^2" />);
    await waitFor(() => {
      expect(screen.getByTestId('latex-preview').innerHTML).toContain('svg');
    });
  });
});
