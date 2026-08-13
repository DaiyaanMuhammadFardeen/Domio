/**
 * EmbedPlayground tests — S3.6.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EmbedPlayground,
  buildEmbedSnippet,
  type EmbedPlaygroundDeck,
  type EmbedConfig,
} from './EmbedPlayground';

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

const DECK: EmbedPlaygroundDeck = {
  id: 'd1',
  host: undefined,
  slides: [
    { id: 's1', title: 'Intro' },
    { id: 's2', title: 'Body' },
    { id: 's3', title: 'Outro' },
  ],
};

describe('buildEmbedSnippet', () => {
  const cfg: EmbedConfig = {
    startSlide: 0,
    width: 960,
    height: 540,
    allowInteractivity: true,
    allowFullscreen: true,
    lazyLoad: true,
    themeSync: false,
  };

  it('passes through undefined startSlide', () => {
    const html = buildEmbedSnippet({ ...cfg, startSlide: undefined }, DECK);
    expect(html).not.toContain('slide=');
  });

  it('includes the deck id in the iframe src', () => {
    const html = buildEmbedSnippet(cfg, DECK);
    expect(html).toContain('src="https://embed.deck.domio.app/d1');
  });

  it('sets lazy=1 when lazyLoad is on', () => {
    const html = buildEmbedSnippet(cfg, DECK);
    expect(html).toContain('lazy=1');
  });

  it('omits lazy=1 when lazyLoad is off', () => {
    const html = buildEmbedSnippet({ ...cfg, lazyLoad: false }, DECK);
    expect(html).not.toContain('lazy=1');
  });

  it('includes fullscreen in allow attribute when enabled', () => {
    const html = buildEmbedSnippet(cfg, DECK);
    expect(html).toContain('fullscreen');
  });

  it('emits sandbox flags without same-origin', () => {
    const html = buildEmbedSnippet(cfg, DECK);
    const sandboxLine = html.split('\n').find((l) => l.includes('sandbox='));
    expect(sandboxLine).toBeDefined();
    expect(sandboxLine).not.toContain('allow-same-origin');
    expect(sandboxLine).toContain('allow-scripts');
  });

  it('honors host override', () => {
    const html = buildEmbedSnippet(cfg, { ...DECK, host: 'decks.acme.com' });
    expect(html).toContain('https://embed.decks.acme.com/d1');
  });

  it('adds slide query when startSlide > 0', () => {
    const html = buildEmbedSnippet({ ...cfg, startSlide: 2 }, DECK);
    expect(html).toContain('slide=2');
  });

  it('omits slide query when startSlide is 0', () => {
    const html = buildEmbedSnippet({ ...cfg, startSlide: 0 }, DECK);
    expect(html).not.toContain('slide=');
  });
});

describe('EmbedPlayground', () => {
  it('renders preview, snippet, and controls', () => {
    render(withLocale(<EmbedPlayground deck={DECK} />));
    expect(screen.getByTestId('embed-playground-preview')).toBeInTheDocument();
    expect(screen.getByTestId('embed-playground-snippet')).toBeInTheDocument();
    expect(screen.getByTestId('embed-playground-slide')).toBeInTheDocument();
  });

  it('lists every deck slide in the start-slide select', () => {
    render(withLocale(<EmbedPlayground deck={DECK} />));
    const sel = screen.getByTestId('embed-playground-slide') as HTMLSelectElement;
    expect(sel.options.length).toBe(3);
    expect(sel.options[0]?.text).toContain('Intro');
  });

  it('emits onChange when width changes', () => {
    const onChange = vi.fn();
    render(withLocale(<EmbedPlayground deck={DECK} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('embed-playground-width'), {
      target: { value: '1280' },
    });
    const lastCall = onChange.mock.calls.at(-1)?.[0] as EmbedConfig;
    expect(lastCall.width).toBe(1280);
  });

  it('emits onChange when an aspect preset is clicked', () => {
    const onChange = vi.fn();
    render(withLocale(<EmbedPlayground deck={DECK} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('embed-playground-aspect-1:1'));
    const lastCall = onChange.mock.calls.at(-1)?.[0] as EmbedConfig;
    expect(lastCall.width).toBe(540);
    expect(lastCall.height).toBe(540);
  });

  it('emits onChange when fullscreen is toggled', () => {
    const onChange = vi.fn();
    render(withLocale(<EmbedPlayground deck={DECK} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('embed-playground-fullscreen'));
    const lastCall = onChange.mock.calls.at(-1)?.[0] as EmbedConfig;
    expect(lastCall.allowFullscreen).toBe(false);
  });

  it('reflects an external value prop', () => {
    render(
      withLocale(
        <EmbedPlayground
          deck={DECK}
          value={{
            startSlide: 1,
            width: 720,
            height: 405,
            allowInteractivity: false,
            allowFullscreen: false,
            lazyLoad: false,
            themeSync: true,
          }}
        />,
      ),
    );
    const width = screen.getByTestId('embed-playground-width') as HTMLInputElement;
    expect(width.value).toBe('720');
    const snippet = screen.getByTestId('embed-playground-snippet').textContent ?? '';
    expect(snippet).toContain('width="720"');
    expect(snippet).toContain('theme=sync');
  });
});
