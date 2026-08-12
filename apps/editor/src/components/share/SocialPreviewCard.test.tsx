/**
 * SocialPreviewCard tests — S3.9.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SocialPreviewCard } from './SocialPreviewCard';

const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
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

describe('SocialPreviewCard', () => {
  it('renders the deck title by default', () => {
    render(withLocale(<SocialPreviewCard platform="twitter" deckTitle="Demo" previewImageUrl={undefined} />));
    expect(screen.getByTestId('social-preview-twitter-title').textContent).toBe('Demo');
  });

  it('shows the placeholder when no image URL is provided', () => {
    render(withLocale(<SocialPreviewCard platform="twitter" deckTitle="Demo" previewImageUrl={undefined} />));
    expect(screen.getByTestId('social-preview-twitter-placeholder')).toBeInTheDocument();
  });

  it('shows the image when previewImageUrl is given', () => {
    render(withLocale(<SocialPreviewCard platform="linkedin" deckTitle="Demo" previewImageUrl="https://cdn.example/x.png" />));
    const img = screen.getByTestId('social-preview-linkedin-image') as HTMLImageElement;
    expect(img.src).toContain('cdn.example/x.png');
  });

  it('honors an override', () => {
    render(
      withLocale(
        <SocialPreviewCard
          platform="slack"
          deckTitle="Demo"
          previewImageUrl={undefined}
          override={{ title: 'Custom', description: 'Custom desc', imageUrl: undefined }}
        />,
      ),
    );
    expect(screen.getByTestId('social-preview-slack-title').textContent).toBe('Custom');
    expect(screen.getByTestId('social-preview-slack-description').textContent).toBe('Custom desc');
  });

  it('emits onOverride when the title input changes', () => {
    const onOverride = vi.fn();
    render(
      withLocale(
        <SocialPreviewCard
          platform="twitter"
          deckTitle="Demo"
          previewImageUrl={undefined}
          onOverride={onOverride}
        />,
      ),
    );
    fireEvent.change(screen.getByTestId('social-preview-twitter-override-title'), {
      target: { value: 'New title' },
    });
    expect(onOverride).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title' }),
    );
  });

  it('renders override inputs only when onOverride is provided', () => {
    const { rerender } = render(
      withLocale(<SocialPreviewCard platform="twitter" deckTitle="Demo" previewImageUrl={undefined} />),
    );
    expect(screen.queryByTestId('social-preview-twitter-override-title')).toBeNull();
    rerender(
      withLocale(
        <SocialPreviewCard
          platform="twitter"
          deckTitle="Demo"
          previewImageUrl={undefined}
          onOverride={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('social-preview-twitter-override-title')).toBeInTheDocument();
  });
});
