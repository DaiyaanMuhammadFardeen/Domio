/**
 * ContentControlTab tests — S3.4.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentControlTab } from './ContentControlTab';

const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
  // The `vi.importActual<typeof import('@domio/ui')>` pattern needs
  // the inline `import('...')` type for module-shape inference —
  // preferred over declaring a hand-rolled type because it stays in
  // sync with the published module surface.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('@domio/ui')>('@domio/ui');
  const React = await import('react');
  return {
    ...actual,
    FormattedMessage: function MockFormattedMessage(props: { id: string }): React.ReactElement {
      const catalogue = React.useContext(FormattedMessageContext);
      const resolved = catalogue[props.id] ?? props.id;
      return <span>{resolved}</span>;
    },
  };
});

function withLocale(node: React.ReactElement): React.ReactElement {
  return (
    <FormattedMessageContext.Provider value={enMessages}>{node}</FormattedMessageContext.Provider>
  );
}

const DECK = {
  id: 'd1',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  title: 'Demo',
  slug: 'demo',
  schemaVersion: '1.0.0',
  revision: 1,
  branch: 'main',
  settings: {
    defaultSlideRatio: { ratioW: 16, ratioH: 9 },
    grid: { size: 8, color: { colorSpace: 'srgb', value: '#fff' } },
    snapToGrid: true,
    showRulers: false,
  },
  variables: [],
  brandKitId: 'b',
  themeId: 'th',
  slides: [
    {
      id: 's1',
      semanticId: 's1',
      position: 0,
      title: 'Intro',
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [],
    },
    {
      id: 's2',
      semanticId: 's2',
      position: 1,
      title: 'Body',
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [],
    },
    {
      id: 's3',
      semanticId: 's3',
      position: 2,
      title: 'Appendix',
      aspect: { ratioW: 16, ratioH: 9 },
      elements: [],
    },
  ],
};

describe('ContentControlTab', () => {
  it('renders one row per slide', () => {
    render(withLocale(<ContentControlTab deck={DECK as never} value={[]} onChange={vi.fn()} />));
    expect(screen.getByTestId('content-control-tab-row-s1')).toBeInTheDocument();
    expect(screen.getByTestId('content-control-tab-row-s2')).toBeInTheDocument();
    expect(screen.getByTestId('content-control-tab-row-s3')).toBeInTheDocument();
  });

  it('emits onChange when a checkbox is toggled', () => {
    const onChange = vi.fn();
    render(
      withLocale(<ContentControlTab deck={DECK as never} value={['s1']} onChange={onChange} />),
    );
    fireEvent.click(screen.getByTestId('content-control-tab-check-s1'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('select-all selects every slide', () => {
    const onChange = vi.fn();
    render(withLocale(<ContentControlTab deck={DECK as never} value={[]} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('content-control-tab-all'));
    expect(onChange).toHaveBeenCalledWith(['s1', 's2', 's3']);
  });

  it('select-none clears the selection', () => {
    const onChange = vi.fn();
    render(
      withLocale(
        <ContentControlTab deck={DECK as never} value={['s1', 's2']} onChange={onChange} />,
      ),
    );
    fireEvent.click(screen.getByTestId('content-control-tab-none'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('tail-to-end selects from a slide to the last', () => {
    const onChange = vi.fn();
    render(withLocale(<ContentControlTab deck={DECK as never} value={[]} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('content-control-tab-tail-s2'));
    expect(onChange).toHaveBeenCalledWith(['s2', 's3']);
  });
});
