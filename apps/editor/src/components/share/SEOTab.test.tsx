/**
 * SEOTab tests — S3.9.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEOTab, DEFAULT_SEO } from './SEOTab';

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

describe('SEOTab', () => {
  it('falls back to the deck title when value.title is empty', () => {
    render(withLocale(<SEOTab value={undefined} deckTitle="My deck" deckId="d1" previewImageUrl={undefined} onChange={vi.fn()} />));
    const title = screen.getByTestId('seo-tab-title') as HTMLInputElement;
    expect(title.value).toBe('My deck');
  });

  it('emits onChange when description is typed', () => {
    const onChange = vi.fn();
    render(withLocale(<SEOTab value={DEFAULT_SEO} deckTitle="Deck" deckId="d1" previewImageUrl={undefined} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('seo-tab-description'), {
      target: { value: 'A new description' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ description: 'A new description' }));
  });

  it('emits onChange when canonical URL changes', () => {
    const onChange = vi.fn();
    render(withLocale(<SEOTab value={DEFAULT_SEO} deckTitle="Deck" deckId="d1" previewImageUrl={undefined} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('seo-tab-canonical'), {
      target: { value: 'https://example.com/d1' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ canonicalUrl: 'https://example.com/d1' }));
  });

  it('emits onChange when robots dropdown changes', () => {
    const onChange = vi.fn();
    render(withLocale(<SEOTab value={DEFAULT_SEO} deckTitle="Deck" deckId="d1" previewImageUrl={undefined} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('seo-tab-robots'), {
      target: { value: 'noindex,nofollow' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ robots: 'noindex,nofollow' }),
    );
  });

  it('shows two social previews (twitter + linkedin)', () => {
    render(withLocale(<SEOTab value={DEFAULT_SEO} deckTitle="Deck" deckId="d1" previewImageUrl="https://cdn.example/x.png" onChange={vi.fn()} />));
    expect(screen.getByTestId('seo-tab-twitter')).toBeInTheDocument();
    expect(screen.getByTestId('seo-tab-linkedin')).toBeInTheDocument();
  });

  it('emits social overrides when twitter override title is typed', () => {
    const onChange = vi.fn();
    render(withLocale(<SEOTab value={DEFAULT_SEO} deckTitle="Deck" deckId="d1" previewImageUrl={undefined} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('seo-tab-twitter-override-title'), {
      target: { value: 'Tw title' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        socialOverrides: expect.objectContaining({
          twitter: expect.objectContaining({ title: 'Tw title' }),
        }),
      }),
    );
  });

  it('renders the image when an image override is set', () => {
    render(
      withLocale(
        <SEOTab
          value={{
            ...DEFAULT_SEO,
            socialImageUrl: 'https://cdn.example/y.png',
          }}
          deckTitle="Deck"
          deckId="d1"
          previewImageUrl={undefined}
          onChange={vi.fn()}
        />,
      ),
    );
    const img = screen.getByTestId('seo-tab-twitter-image') as HTMLImageElement;
    expect(img.src).toContain('cdn.example/y.png');
  });
});
