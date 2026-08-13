/**
 * HandoutLayoutPicker tests — S3.10.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HandoutLayoutPicker, buildHandoutRequest, DEFAULT_HANDOUT } from './HandoutLayoutPicker';

const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('@domio/ui')>('@domio/ui');
  const React = await import('react');
  return {
    ...actual,
    FormattedMessage: function MockFormattedMessage(props: {
      id: string;
    }): React.ReactElement {
      const catalogue = React.useContext(FormattedMessageContext);
      const resolved = catalogue[props.id] ?? props.id;
      return <span>{resolved}</span>;
    },
  };
});

function withLocale(node: React.ReactElement): React.ReactElement {
  return (
    <FormattedMessageContext.Provider value={enMessages}>
      {node}
    </FormattedMessageContext.Provider>
  );
}

describe('buildHandoutRequest', () => {
  it('produces a pdf+handout-* payload', () => {
    const req = buildHandoutRequest(DEFAULT_HANDOUT, 'd1');
    expect(req.format).toBe('pdf');
    expect(req.layout).toBe('handout-notes');
    expect(req.deck_id).toBe('d1');
  });

  it('reflects the layout choice', () => {
    const req = buildHandoutRequest({ ...DEFAULT_HANDOUT, layout: 'grid-4' }, 'd1');
    expect(req.layout).toBe('handout-grid-4');
  });
});

describe('HandoutLayoutPicker', () => {
  it('renders all four layout buttons', () => {
    render(withLocale(<HandoutLayoutPicker slideCount={10} value={DEFAULT_HANDOUT} onChange={vi.fn()} />));
    expect(screen.getByTestId('handout-layout-picker-notes')).toBeInTheDocument();
    expect(screen.getByTestId('handout-layout-picker-grid-4')).toBeInTheDocument();
    expect(screen.getByTestId('handout-layout-picker-grid-6')).toBeInTheDocument();
    expect(screen.getByTestId('handout-layout-picker-grid-9')).toBeInTheDocument();
  });

  it('emits onChange when a layout is selected', () => {
    const onChange = vi.fn();
    render(withLocale(<HandoutLayoutPicker slideCount={10} value={DEFAULT_HANDOUT} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('handout-layout-picker-grid-6'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layout: 'grid-6' }));
  });

  it('falls back to defaults when value is undefined', () => {
    render(withLocale(<HandoutLayoutPicker slideCount={10} value={undefined} onChange={vi.fn()} />));
    const notesCheckbox = screen.getByTestId('handout-layout-picker-opt-notes') as HTMLInputElement;
    expect(notesCheckbox.checked).toBe(true);
  });

  it('emits onChange when opt-notes is toggled', () => {
    const onChange = vi.fn();
    render(withLocale(<HandoutLayoutPicker slideCount={10} value={DEFAULT_HANDOUT} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('handout-layout-picker-opt-notes'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ includeNotes: false }));
  });

  it('renders the preview section', () => {
    render(withLocale(<HandoutLayoutPicker slideCount={10} value={DEFAULT_HANDOUT} onChange={vi.fn()} />));
    expect(screen.getByTestId('handout-layout-picker-preview')).toBeInTheDocument();
  });
});
