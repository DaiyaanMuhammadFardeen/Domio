/**
 * CustomDomainPicker tests — S3.5.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CustomDomainPicker,
  DEFAULT_CUSTOM_DOMAIN_HOST,
  type CustomDomainOption,
} from './CustomDomainPicker';

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

const OPTIONS: readonly CustomDomainOption[] = [
  { hostname: 'decks.acme.com', verified: true, label: 'Investor relations' },
  { hostname: 'pitch.acme.com', verified: false, label: 'Sales' },
  { hostname: 'share.initech.io', verified: true },
];

describe('CustomDomainPicker', () => {
  it('renders the default option', () => {
    render(
      withLocale(<CustomDomainPicker options={OPTIONS} value={undefined} onChange={vi.fn()} />),
    );
    expect(screen.getByTestId('custom-domain-picker-default')).toBeInTheDocument();
    expect(screen.getByTestId('custom-domain-picker-default')).toBeChecked();
  });

  it('only lists verified domains', () => {
    render(
      withLocale(<CustomDomainPicker options={OPTIONS} value={undefined} onChange={vi.fn()} />),
    );
    expect(screen.getByTestId('custom-domain-picker-option-decks.acme.com')).toBeInTheDocument();
    expect(screen.getByTestId('custom-domain-picker-option-share.initech.io')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-domain-picker-option-pitch.acme.com')).toBeNull();
  });

  it('checks the matching domain when one is selected', () => {
    render(
      withLocale(
        <CustomDomainPicker options={OPTIONS} value="decks.acme.com" onChange={vi.fn()} />,
      ),
    );
    const radio = screen.getByTestId(
      'custom-domain-picker-check-decks.acme.com',
    ) as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('emits onChange with the hostname when a domain is selected', () => {
    const onChange = vi.fn();
    render(
      withLocale(<CustomDomainPicker options={OPTIONS} value={undefined} onChange={onChange} />),
    );
    fireEvent.click(screen.getByTestId('custom-domain-picker-check-decks.acme.com'));
    expect(onChange).toHaveBeenCalledWith('decks.acme.com');
  });

  it('emits undefined when default is re-selected', () => {
    const onChange = vi.fn();
    render(
      withLocale(
        <CustomDomainPicker options={OPTIONS} value="decks.acme.com" onChange={onChange} />,
      ),
    );
    fireEvent.click(screen.getByTestId('custom-domain-picker-default'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('renders the empty-state hint when no verified options', () => {
    render(withLocale(<CustomDomainPicker options={[]} value={undefined} onChange={vi.fn()} />));
    expect(screen.queryByTestId('custom-domain-picker-option-decks.acme.com')).toBeNull();
  });

  it('shows unverified-hint when some options are unverified', () => {
    render(
      withLocale(<CustomDomainPicker options={OPTIONS} value={undefined} onChange={vi.fn()} />),
    );
    expect(screen.getByText(/Unverified domains are hidden/i)).toBeInTheDocument();
  });

  it('exports the default host', () => {
    expect(DEFAULT_CUSTOM_DOMAIN_HOST).toBe('deck.domio.app');
  });
});
